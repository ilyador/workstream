import { Router } from 'express';
import { supabase, hasActiveWorkstreamJob } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';
import { revertToCheckpoint, deleteCheckpoint } from '../checkpoint.js';
import { queueNextWorkstreamTask } from '../auto-continue.js';
import { autoCommit } from '../git-utils.js';
import { resolveFlowForTask } from '../flow-resolution.js';

export const executionRouter = Router();

// Start a job
executionRouter.post('/api/run', requireAuth, async (req, res) => {
  const { taskId, projectId, localPath } = req.body;

  if (!taskId || !projectId || !localPath) {
    return res.status(400).json({ error: 'taskId, projectId, and localPath are required' });
  }

  // Validate membership and localPath
  const userId = (req as any).userId;
  const { data: membership } = await supabase
    .from('project_members')
    .select('local_path, role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  if (membership?.role === 'manager') {
    return res.status(403).json({ error: 'Managers cannot run AI tasks' });
  }
  if (membership && membership.local_path && membership.local_path !== localPath) {
    return res.status(403).json({ error: 'localPath does not match your registered project path' });
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

  // Prevent concurrent jobs for the same task
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['queued', 'running', 'paused', 'review'])
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    return res.status(409).json({ error: 'A job is already queued, running, or paused for this task', jobId: existingJobs[0].id });
  }

  // Prevent concurrent jobs in the same workstream (shared worktree)
  if (task.workstream_id) {
    const activeJobId = await hasActiveWorkstreamJob(task.workstream_id);
    if (activeJobId) {
      return res.status(409).json({ error: 'Another task in this workstream is already running', jobId: activeJobId });
    }
  }

  const { flowSnapshot, firstPhase, maxAttempts, flowId } = await resolveFlowForTask(task, projectId, localPath);

  // Create job with queued status — worker picks it up
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: taskId,
      project_id: projectId,
      local_path: localPath,
      status: 'queued',
      current_phase: firstPhase,
      max_attempts: maxAttempts,
      flow_id: flowId,
      flow_snapshot: flowSnapshot,
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

  const { data: jobRow } = await supabase.from('jobs').select('log_offset').eq('id', jobId).single();
  const offset = jobRow?.log_offset || 0;
  let lastId = parseInt(req.headers['last-event-id'] as string) || offset;
  let closed = false;

  const pollInterval = setInterval(async () => {
    if (closed) return;
    try {
      const { data: logs } = await supabase
        .from('job_logs')
        .select('id, event, data')
        .eq('job_id', jobId)
        .gt('id', lastId)
        .order('id', { ascending: true })
        .limit(100);

      if (closed || !logs || logs.length === 0) return;

      for (const log of logs) {
        if (closed) break;
        res.write(`id: ${log.id}\nevent: ${log.event}\ndata: ${JSON.stringify(log.data)}\n\n`);
        lastId = log.id;

        if (log.event === 'done' || log.event === 'failed') {
          closed = true;
          clearInterval(pollInterval);
          clearInterval(heartbeat);
          res.end();
          return;
        }
      }
    } catch (err: any) {
      console.warn(`[execution] SSE poll error for job ${jobId}:`, err.message);
    }
  }, 500);

  const heartbeat = setInterval(() => {
    if (!closed) res.write(':heartbeat\n\n');
  }, 15000);

  req.on('close', () => {
    closed = true;
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

// Continue a failed job from last completed phase
executionRouter.post('/api/jobs/:id/continue', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'failed') return res.status(400).json({ error: 'Job is not failed' });

  const phasesCompleted = job.phases_completed || [];
  if (phasesCompleted.length === 0) return res.status(400).json({ error: 'No completed phases to continue from' });

  const { data: maxLog } = await supabase.from('job_logs').select('id').eq('job_id', jobId).order('id', { ascending: false }).limit(1).single();
  const logOffset = maxLog?.id || 0;

  // Rebuild flow_snapshot from current flow_steps so updated instructions take effect
  let newSnapshot = job.flow_snapshot;
  if (job.flow_id) {
    const { data: flow } = await supabase.from('flows').select('*, flow_steps(*)').eq('id', job.flow_id).single();
    if (flow) {
      const { buildFlowSnapshot } = await import('../runner.js');
      newSnapshot = buildFlowSnapshot(flow);
    }
  }

  await supabase.from('jobs').update({ status: 'queued', question: null, log_offset: logOffset, flow_snapshot: newSnapshot }).eq('id', jobId);
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', job.task_id);

  await supabase.from('job_logs').insert({
    job_id: jobId,
    event: 'log',
    data: { text: `[continue] Resuming from phase ${phasesCompleted.length + 1} (${phasesCompleted.length} phases already completed)` },
  });

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
  const localPath = req.body.localPath || job.local_path || '';

  // Clean checkpoint
  try { deleteCheckpoint(localPath, jobId); } catch {}

  // Mark job done + checkpoint cleaned in one update
  await Promise.all([
    supabase.from('jobs').update({ status: 'done', completed_at: now, checkpoint_status: 'cleaned' }).eq('id', jobId),
    supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', job.task_id),
  ]);

  // Write done event so SSE clients see the terminal event
  await supabase.from('job_logs').insert({ job_id: jobId, event: 'done', data: {} });

  // Fetch task for auto-commit + auto-continue (single query)
  let task: any = null;
  const { data: taskData, error: taskFetchErr } = await supabase
    .from('tasks')
    .select('id, type, title, auto_continue, workstream_id, position')
    .eq('id', job.task_id)
    .single();
  if (taskFetchErr) {
    console.error('[approve] Task fetch failed:', taskFetchErr.message);
  } else {
    task = taskData;
  }

  // Auto-commit the changes
  if (task) {
    try {
      await autoCommit(localPath, task.type, task.title);
    } catch (err: any) {
      console.error('[approve] Auto-commit failed:', err.message);
    }
  }

  // Auto-continue: queue next task in workstream
  if (task?.workstream_id) {
    try {
      await queueNextWorkstreamTask({
        completedTaskId: task.id,
        projectId: job.project_id,
        localPath,
        workstreamId: task.workstream_id,
        completedPosition: task.position,
      });
    } catch (err: any) {
      console.error('[auto-continue] Error:', err.message);
    }
  }

  res.json({ ok: true });
});

// Reject job -> revert code, delete artifacts, reset task to todo
executionRouter.post('/api/jobs/:id/reject', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Revert git checkpoint
  if (job.local_path) {
    try { revertToCheckpoint(job.local_path, jobId); } catch {}
  }

  // Delete task artifacts from storage + DB
  const { data: artifacts } = await supabase.from('task_artifacts').select('id, storage_path').eq('task_id', job.task_id);
  if (artifacts && artifacts.length > 0) {
    await supabase.storage.from('task-artifacts').remove(artifacts.map(a => a.storage_path));
    await supabase.from('task_artifacts').delete().eq('task_id', job.task_id);
  }

  // Delete job, reset task
  await supabase.from('jobs').delete().eq('id', jobId);
  await supabase.from('tasks').update({ status: 'todo', followup_notes: null }).eq('id', job.task_id);

  res.json({ ok: true });
});

// Rework job -> save feedback, re-run with own artifacts as context
executionRouter.post('/api/jobs/:id/rework', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { note, localPath, projectId } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (!['review', 'done'].includes(job.status)) return res.status(400).json({ error: 'Job is not in review or done' });

  // Complete current job
  if (job.local_path) { try { deleteCheckpoint(job.local_path, jobId); } catch {} }
  await supabase.from('jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
    checkpoint_status: 'cleaned',
  }).eq('id', jobId);
  await supabase.from('job_logs').insert({ job_id: jobId, event: 'done', data: {} });

  // Save feedback and reset task for re-run
  await supabase.from('tasks').update({
    status: 'in_progress',
    followup_notes: note || null,
  }).eq('id', job.task_id);

  // Fetch task to build flow snapshot
  const { data: task } = await supabase.from('tasks').select('*').eq('id', job.task_id).single();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const reworkProjectId = projectId || job.project_id;
  const reworkLocalPath = localPath || job.local_path;
  const { flowSnapshot, firstPhase, maxAttempts, flowId } = await resolveFlowForTask(task, reworkProjectId, reworkLocalPath);

  // Create new job
  const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
    task_id: job.task_id,
    project_id: reworkProjectId,
    local_path: reworkLocalPath,
    status: 'queued',
    current_phase: firstPhase,
    max_attempts: maxAttempts,
    flow_id: flowId,
    flow_snapshot: flowSnapshot,
  }).select().single();

  if (jobErr || !newJob) return res.status(500).json({ error: 'Failed to create rework job' });

  res.json({ jobId: newJob.id });
});

// Move done job's task to backlog -> delete job, reset task
executionRouter.post('/api/jobs/:id/backlog', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('task_id, status').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ error: 'Job is not done' });

  await supabase.from('jobs').delete().eq('id', jobId);
  await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);

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
  await supabase.from('tasks').update({ status: 'todo' }).eq('id', job.task_id);

  res.json({ ok: true });
});
