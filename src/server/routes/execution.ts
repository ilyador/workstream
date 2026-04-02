import { Router } from 'express';
import { loadTaskTypeConfig } from '../runner.js';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';
import { revertToCheckpoint, deleteCheckpoint } from '../checkpoint.js';

export const executionRouter = Router();

// Start a job
executionRouter.post('/api/run', requireAuth, async (req, res) => {
  const { taskId, projectId, localPath } = req.body;

  if (!taskId || !projectId || !localPath) {
    return res.status(400).json({ error: 'taskId, projectId, and localPath are required' });
  }

  // Validate localPath against the user's registered path for this project
  const userId = (req as any).userId;
  const { data: membership } = await supabase
    .from('project_members')
    .select('local_path')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  if (membership && membership.local_path && membership.local_path !== localPath) {
    return res.status(403).json({ error: 'localPath does not match your registered project path' });
  }

  // Prevent concurrent jobs for the same task
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['queued', 'running', 'paused'])
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    return res.status(409).json({ error: 'A job is already queued, running, or paused for this task', jobId: existingJobs[0].id });
  }

  // Fetch task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (taskErr || !task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (task.mode !== 'ai') {
    return res.status(400).json({ error: 'Only AI tasks can be run' });
  }

  // Load task type config to get initial phase/max_attempts
  const taskType = loadTaskTypeConfig(localPath, task.type);

  // Create job with queued status — worker picks it up
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: taskId,
      project_id: projectId,
      local_path: localPath,
      status: 'queued',
      current_phase: taskType.phases[0],
      max_attempts: taskType.verify_retries + 1,
    })
    .select()
    .single();

  if (jobErr || !job) {
    return res.status(500).json({ error: 'Failed to create job' });
  }

  // Update task status
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', taskId);

  res.json({ jobId: job.id });
});

// SSE stream for job logs — polls job_logs table
executionRouter.get('/api/jobs/:id/events', async (req, res) => {
  const jobId = req.params.id;

  // Validate token from query param
  const token = req.query.token as string;
  if (token) {
    const { error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('retry: 3000\n\n');
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`);

  let lastId = parseInt(req.headers['last-event-id'] as string) || 0;
  let jobDone = false;

  // Poll job_logs every 500ms
  const pollInterval = setInterval(async () => {
    try {
      const { data: logs } = await supabase
        .from('job_logs')
        .select('id, event, data')
        .eq('job_id', jobId)
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(100);

      if (logs && logs.length > 0) {
        for (const log of logs) {
          res.write(`id: ${log.id}\nevent: ${log.event}\ndata: ${JSON.stringify(log.data)}\n\n`);
          lastId = log.id;

          if (log.event === 'done' || log.event === 'failed') {
            jobDone = true;
          }
        }
      }

      if (jobDone) {
        clearInterval(pollInterval);
        clearInterval(heartbeat);
        res.end();
      }
    } catch {
      // Ignore poll errors — next tick will retry
    }
  }, 500);

  // Heartbeat every 15s
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(pollInterval);
    clearInterval(heartbeat);
  });
});

// Reply to paused job
executionRouter.post('/api/jobs/:id/reply', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { answer } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'paused') {
    return res.status(400).json({ error: 'Job is not paused' });
  }

  const { data: task } = await supabase.from('tasks').select('*').eq('id', job.task_id).single();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Mark job queued with answer — worker picks it up
  await supabase.from('jobs').update({ status: 'queued', answer }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);

  res.json({ ok: true });
});

// Terminate a running job
executionRouter.post('/api/jobs/:id/terminate', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Signal worker to cancel — it handles revert + cleanup
  await supabase.from('jobs').update({ status: 'canceling' }).eq('id', jobId);

  res.json({ ok: true });
});

// Approve job
executionRouter.post('/api/jobs/:id/approve', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'review') {
    return res.status(400).json({ error: 'Job is not in review' });
  }

  const now = new Date().toISOString();
  const localPath = req.body.localPath || '';

  // Mark job and task done
  await Promise.all([
    supabase.from('jobs').update({ status: 'done', completed_at: now }).eq('id', jobId),
    supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', job.task_id),
  ]);

  // Clean checkpoint
  try { deleteCheckpoint(localPath, jobId); } catch {}
  await supabase.from('jobs').update({ checkpoint_status: 'cleaned' }).eq('id', jobId);

  // Lightweight auto-continue: if task has auto_continue and belongs to a workstream,
  // queue the next incomplete AI task
  try {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, auto_continue, workstream_id, position, mode')
      .eq('id', job.task_id)
      .single();

    if (task && task.auto_continue && task.workstream_id != null) {
      const { data: nextTask } = await supabase
        .from('tasks')
        .select('id, type, mode')
        .eq('workstream_id', task.workstream_id)
        .in('status', ['backlog', 'todo'])
        .neq('mode', 'human')
        .gt('position', task.position)
        .order('position', { ascending: true })
        .limit(1)
        .single();

      if (nextTask) {
        const nextTaskType = loadTaskTypeConfig(localPath, nextTask.type);

        await supabase.from('jobs').insert({
          task_id: nextTask.id,
          project_id: job.project_id,
          local_path: localPath,
          status: 'queued',
          current_phase: nextTaskType.phases[0],
          max_attempts: nextTaskType.verify_retries + 1,
        });

        await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', nextTask.id);
      }
    }
  } catch (err: any) {
    console.error('[auto-continue] Error:', err.message);
  }

  res.json({ ok: true });
});

// Reject job -> back to backlog
executionRouter.post('/api/jobs/:id/reject', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { note } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  await supabase.from('jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', jobId);

  await supabase.from('tasks').update({
    status: 'backlog',
    followup_notes: note || null,
  }).eq('id', job.task_id);

  res.json({ ok: true });
});

// Revert job -> restore files to pre-job state
executionRouter.post('/api/jobs/:id/revert', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { localPath } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (!['review', 'failed', 'done'].includes(job.status)) {
    return res.status(400).json({ error: 'Job must be in review, failed, or done status to revert' });
  }

  if (!localPath) {
    return res.status(400).json({ error: 'localPath is required' });
  }

  try {
    revertToCheckpoint(localPath, jobId);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to revert checkpoint' });
  }

  await supabase.from('jobs').update({ checkpoint_status: 'reverted' }).eq('id', jobId);

  await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);

  res.json({ ok: true });
});
