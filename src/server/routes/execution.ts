import { Router } from 'express';
import { runJob, cancelJob, loadTaskTypeConfig } from '../runner.js';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from '../checkpoint.js';

// SSE connections per job
const sseClients = new Map<string, Set<(event: string, data: any) => void>>();

// Feature 7: SSE event buffer -- stores last 100 events per job for replay
const MAX_BUFFER_SIZE = 100;
const sseEventBuffer = new Map<string, Array<{ event: string; data: any }>>();

function broadcast(jobId: string, event: string, data: any) {
  // Push to buffer
  if (!sseEventBuffer.has(jobId)) sseEventBuffer.set(jobId, []);
  const buffer = sseEventBuffer.get(jobId)!;
  buffer.push({ event, data });
  if (buffer.length > MAX_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
  }

  const clients = sseClients.get(jobId);
  if (clients) {
    for (const send of clients) {
      send(event, data);
    }
  }
}

export const executionRouter = Router();

// Start a job
executionRouter.post('/api/run', requireAuth, async (req, res) => {
  const { taskId, projectId, localPath } = req.body;

  if (!taskId || !projectId || !localPath) {
    return res.status(400).json({ error: 'taskId, projectId, and localPath are required' });
  }

  // Prevent concurrent jobs for the same task
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('task_id', taskId)
    .in('status', ['running', 'paused'])
    .limit(1);

  if (existingJobs && existingJobs.length > 0) {
    return res.status(409).json({ error: 'A job is already running or paused for this task', jobId: existingJobs[0].id });
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

  // Load task type config
  const taskType = loadTaskTypeConfig(localPath, task.type);

  // Create job
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: taskId,
      project_id: projectId,
      status: 'running',
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

  // Create checkpoint before running
  try {
    const checkpoint = createCheckpoint(localPath, job.id);
    await supabase.from('jobs').update({
      checkpoint_ref: checkpoint.commitSha,
      checkpoint_status: 'active'
    }).eq('id', job.id);
    broadcast(job.id, 'log', { text: '[checkpoint] Saved working directory state\n' });
  } catch (err: any) {
    broadcast(job.id, 'log', { text: `[checkpoint] Warning: ${err.message}\n` });
  }

  // Return job ID immediately -- execution happens async
  res.json({ jobId: job.id });

  // Feature 8: Delay 500ms to give the browser time to connect SSE before events fire
  setTimeout(() => {
  runJob({
    jobId: job.id,
    taskId,
    projectId,
    localPath,
    task,
    taskType,
    phasesAlreadyCompleted: [],
    onLog: (text) => broadcast(job.id, 'log', { text }),
    onPhaseStart: (phase, attempt) => broadcast(job.id, 'phase_start', { phase, attempt }),
    onPhaseComplete: (phase, output) => broadcast(job.id, 'phase_complete', { phase, output }),
    onPause: (question) => broadcast(job.id, 'paused', { question }),
    onReview: (result) => broadcast(job.id, 'review', result),
    onDone: () => broadcast(job.id, 'done', {}),
    onFail: (error) => broadcast(job.id, 'failed', { error }),
  }).catch(err => {
    broadcast(job.id, 'failed', { error: err.message });
  });
  }, 500);
});

// SSE stream for job logs
executionRouter.get('/api/jobs/:id/events', (req, res) => {
  const jobId = req.params.id;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Tell EventSource to retry after 3 seconds on disconnect
  res.write('retry: 3000\n\n');

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Register client
  if (!sseClients.has(jobId)) sseClients.set(jobId, new Set());
  sseClients.get(jobId)!.add(send);

  // Send initial connected event so the client knows the stream is live
  send('connected', { status: 'ok' });

  // Feature 7: Replay buffered events for late-connecting clients
  const buffer = sseEventBuffer.get(jobId);
  if (buffer && buffer.length > 0) {
    for (const entry of buffer) {
      send(entry.event, entry.data);
    }
  }

  // Send heartbeat
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(jobId)?.delete(send);
    if (sseClients.get(jobId)?.size === 0) sseClients.delete(jobId);
  });
});

// Reply to paused job
executionRouter.post('/api/jobs/:id/reply', requireAuth, async (req, res) => {
  const jobId = req.params.id;
  const { answer, localPath } = req.body;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'paused') {
    return res.status(400).json({ error: 'Job is not paused' });
  }

  // Save answer and resume
  await supabase.from('jobs').update({ status: 'running', answer }).eq('id', jobId);

  const { data: task } = await supabase.from('tasks').select('*').eq('id', job.task_id).single();
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);

  const taskType = loadTaskTypeConfig(localPath, task.type);

  // Load phases already completed so we skip them on resume
  const phasesAlreadyCompleted: any[] = (job.phases_completed as any[]) || [];

  res.json({ ok: true });

  // Resume execution
  runJob({
    jobId,
    taskId: task.id,
    projectId: job.project_id,
    localPath,
    task: { ...task, answer },
    taskType,
    phasesAlreadyCompleted,
    onLog: (text) => broadcast(jobId, 'log', { text }),
    onPhaseStart: (phase, attempt) => broadcast(jobId, 'phase_start', { phase, attempt }),
    onPhaseComplete: (phase, output) => broadcast(jobId, 'phase_complete', { phase, output }),
    onPause: (question) => broadcast(jobId, 'paused', { question }),
    onReview: (result) => broadcast(jobId, 'review', result),
    onDone: () => broadcast(jobId, 'done', {}),
    onFail: (error) => broadcast(jobId, 'failed', { error }),
  }).catch(err => {
    broadcast(jobId, 'failed', { error: err.message });
  });
});

// Terminate a running job
executionRouter.post('/api/jobs/:id/terminate', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Kill the child process
  cancelJob(jobId);

  // Mark job as failed
  await supabase.from('jobs').update({
    status: 'failed',
    completed_at: new Date().toISOString(),
    question: 'Job terminated by user',
  }).eq('id', jobId);

  // Move task back to backlog
  await supabase.from('tasks').update({
    status: 'backlog',
  }).eq('id', job.task_id);

  broadcast(jobId, 'failed', { error: 'Job terminated by user' });

  res.json({ ok: true });
});

// Approve job
executionRouter.post('/api/jobs/:id/approve', requireAuth, async (req, res) => {
  const jobId = req.params.id;

  const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();
  if (!job || job.status !== 'review') {
    return res.status(400).json({ error: 'Job is not in review' });
  }

  await supabase.from('jobs').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', jobId);

  await supabase.from('tasks').update({
    status: 'done',
    completed_at: new Date().toISOString(),
  }).eq('id', job.task_id);

  try { deleteCheckpoint(req.body.localPath || '', jobId); } catch {}
  await supabase.from('jobs').update({ checkpoint_status: 'cleaned' }).eq('id', jobId);

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

  broadcast(jobId, 'reverted', {});

  res.json({ ok: true });
});
