import 'dotenv/config';
import { execFileSync } from 'child_process';
import { runJob, loadTaskTypeConfig, cancelJob, cancelAllJobs, cleanupOrphanedJobs } from './runner.js';
import { supabase } from './supabase.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from './checkpoint.js';
import { queueNextWorkstreamTask } from './auto-continue.js';
import { ensureWorktree } from './worktree.js';

// ---------------------------------------------------------------------------
// DB logging with batching for high-throughput log events
// ---------------------------------------------------------------------------

const logBuffer: Array<{ job_id: string; event: string; data: Record<string, any> }> = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL = 100; // ms
const FLUSH_SIZE = 20;

async function flushLogs(): Promise<void> {
  if (logBuffer.length === 0) return;
  const batch = logBuffer.slice();
  const { error } = await supabase.from('job_logs').insert(batch);
  if (error) {
    console.error('[worker] Batch log write error:', error.message);
    // Keep entries in buffer for next flush attempt
    return;
  }
  // Only remove on success
  logBuffer.splice(0, batch.length);
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushLogs();
  }, FLUSH_INTERVAL);
}

async function writeLog(jobId: string, event: string, data: Record<string, any> = {}): Promise<void> {
  // Critical events (done, failed, review, paused) flush immediately
  if (event === 'done' || event === 'failed' || event === 'review' || event === 'paused') {
    // Flush any buffered logs first to maintain ordering
    await flushLogs();
    await supabase.from('job_logs').insert({ job_id: jobId, event, data });
    return;
  }
  // Non-critical events (log, phase_start, phase_complete) are batched
  logBuffer.push({ job_id: jobId, event, data });
  if (logBuffer.length >= FLUSH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    await flushLogs();
  } else {
    scheduleFlush();
  }
}

// ---------------------------------------------------------------------------
// Callbacks that the runner uses — fire-and-forget so we never block the runner
// ---------------------------------------------------------------------------

function makeDbCallbacks(jobId: string) {
  return {
    onLog: (text: string) => {
      writeLog(jobId, 'log', { text }).then().catch((err) => {
        console.error(`[worker] writeLog error (log): ${err.message}`);
      });
    },
    onPhaseStart: (phase: string, attempt: number) => {
      writeLog(jobId, 'phase_start', { phase, attempt }).then().catch((err) => {
        console.error(`[worker] writeLog error (phase_start): ${err.message}`);
      });
    },
    onPhaseComplete: (phase: string, output: any) => {
      writeLog(jobId, 'phase_complete', { phase, output }).then().catch((err) => {
        console.error(`[worker] writeLog error (phase_complete): ${err.message}`);
      });
    },
    onPause: (question: string) => {
      writeLog(jobId, 'paused', { question }).then().catch((err) => {
        console.error(`[worker] writeLog error (paused): ${err.message}`);
      });
    },
    onDone: () => {
      writeLog(jobId, 'done', {}).then().catch((err) => {
        console.error(`[worker] writeLog error (done): ${err.message}`);
      });
    },
    onFail: (error: string) => {
      writeLog(jobId, 'failed', { error }).then().catch((err) => {
        console.error(`[worker] writeLog error (failed): ${err.message}`);
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Start a queued job
// ---------------------------------------------------------------------------

async function startJob(job: any): Promise<void> {
  const jobId: string = job.id;
  let localPath: string = job.local_path;

  // Mark running
  await supabase.from('jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', jobId);

  // Fetch the task
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', job.task_id)
    .single();

  if (taskErr || !task) {
    await writeLog(jobId, 'failed', { error: 'Task not found' });
    await supabase.from('jobs').update({ status: 'failed', completed_at: new Date().toISOString(), question: 'Job failed: task not found' }).eq('id', jobId);
    return;
  }

  // Resolve worktree path if task belongs to a workstream
  if (task.workstream_id) {
    try {
      const { data: ws } = await supabase
        .from('workstreams')
        .select('name')
        .eq('id', task.workstream_id)
        .single();
      if (ws) {
        const slug = ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
        localPath = ensureWorktree(localPath, slug);
        await supabase.from('jobs').update({ local_path: localPath }).eq('id', jobId);
        await writeLog(jobId, 'log', { text: `[worktree] Using worktree at ${localPath}` });
      }
    } catch (err: any) {
      console.error(`[worker] Worktree setup failed, using project root:`, err.message);
      await writeLog(jobId, 'log', { text: `[worktree] Setup failed, using project root: ${err.message}` });
    }
  }

  // Update task status
  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);

  const taskType = loadTaskTypeConfig(localPath, task.type);

  // Determine fresh start vs resume
  const phasesAlreadyCompleted: any[] = (job.phases_completed as any[]) || [];
  const isResume = phasesAlreadyCompleted.length > 0 && job.answer != null;

  // Create checkpoint for fresh starts only
  if (!isResume) {
    try {
      const checkpoint = createCheckpoint(localPath, jobId);
      await supabase.from('jobs').update({
        checkpoint_ref: checkpoint.commitSha,
        checkpoint_status: 'active',
      }).eq('id', jobId);
      await writeLog(jobId, 'log', { text: '[checkpoint] Saved working directory state' });
    } catch (err: any) {
      await writeLog(jobId, 'log', { text: `[checkpoint] Warning: ${err.message}` });
    }
  }

  // Build onReview callback
  const onReview = task.auto_continue === true
    ? async (result: any) => {
        await writeLog(jobId, 'review', result);
        // Auto-approve: mark job done, task done, clean checkpoint
        await supabase.from('jobs').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', jobId);
        await supabase.from('tasks').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', task.id);
        try { deleteCheckpoint(localPath, jobId); } catch {}
        await supabase.from('jobs').update({ checkpoint_status: 'cleaned' }).eq('id', jobId);
        // Auto-commit the changes
        try {
          const git = (args: string[]) => execFileSync('git', args, { cwd: localPath, encoding: 'utf-8', timeout: 15000 }).trim();
          git(['add', '-A']);
          try {
            git(['commit', '-m', `codesync(${task.type}): ${task.title}`]);
          } catch { /* nothing to commit is ok */ }
        } catch (err: any) {
          console.error('[worker] Auto-commit failed:', err.message);
        }
        await writeLog(jobId, 'done', {});
        // Queue next task in workstream
        if (task.workstream_id) {
          try {
            await queueNextWorkstreamTask({
              completedTaskId: task.id,
              projectId: job.project_id,
              localPath,
              workstreamId: task.workstream_id,
              completedPosition: task.position,
            });
          } catch (err: any) {
            console.error('[worker] auto-continue error:', err.message);
            await writeLog(jobId, 'log', { text: `[auto-continue] Failed to queue next task: ${err.message}` });
          }
        }
      }
    : async (result: any) => {
        await writeLog(jobId, 'review', result);
      };

  const callbacks = makeDbCallbacks(jobId);

  try {
    await runJob({
      jobId,
      taskId: task.id,
      projectId: job.project_id,
      localPath,
      task: isResume ? { ...task, answer: job.answer } : task,
      taskType,
      phasesAlreadyCompleted,
      ...callbacks,
      // Always override onDone — runner calls it after onReview for all paths.
      // For auto-continue: onReview already wrote the 'done' event.
      // For manual review: job is in 'review' status, not done — no terminal event yet.
      onDone: () => {},
      onReview,
    });
  } catch (err: any) {
    await writeLog(jobId, 'failed', { error: err.message });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: `Job failed: ${err.message}`,
    }).eq('id', jobId);
    await supabase.from('tasks').update({ status: 'backlog' }).eq('id', task.id);
  }
}

// ---------------------------------------------------------------------------
// Poll loop: pick up queued jobs
// ---------------------------------------------------------------------------

let busyJobId: string | null = null;

setInterval(async () => {
  try {
    if (busyJobId) return;

    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'queued')
      .order('started_at', { ascending: true })
      .limit(1);

    if (!jobs || jobs.length === 0) return;

    const job = jobs[0];
    busyJobId = job.id;
    console.log(`[worker] Picked up job ${job.id} for task ${job.task_id}`);

    startJob(job)
      .catch((err) => console.error(`[worker] startJob error: ${err.message}`))
      .finally(() => { busyJobId = null; });
  } catch (err: any) {
    console.error('[worker] Poll error:', err.message);
  }
}, 1000);

// ---------------------------------------------------------------------------
// Cancellation loop: handle jobs marked as canceling
// ---------------------------------------------------------------------------

setInterval(async () => {
  try {
    const { data: cancelingJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'canceling');

    if (!cancelingJobs || cancelingJobs.length === 0) return;

    for (const job of cancelingJobs) {
      try {
        console.log(`[worker] Canceling job ${job.id}`);
        cancelJob(job.id);

        if (job.local_path) {
          try {
            revertToCheckpoint(job.local_path, job.id);
          } catch { /* checkpoint may not exist for queued jobs */ }
        }

        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: 'Job failed: canceled by user.',
        }).eq('id', job.id);
        await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);
        await writeLog(job.id, 'failed', { error: 'Job canceled by user' });
      } catch (err: any) {
        console.error(`[worker] Cancel error for job ${job.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[worker] Cancellation poll error:', err.message);
  }
}, 1000);

// ---------------------------------------------------------------------------
// Orphan cleanup on startup
// ---------------------------------------------------------------------------

// Clean up orphaned running jobs + stuck canceling jobs
(async () => {
  try {
    const count = await cleanupOrphanedJobs();
    if (count > 0) console.log(`[worker] Cleaned up ${count} orphaned jobs`);

    // Also clean up any jobs stuck in 'canceling' state
    const { data: stuck } = await supabase
      .from('jobs')
      .select('id, task_id')
      .eq('status', 'canceling');
    if (stuck && stuck.length > 0) {
      for (const job of stuck) {
        const msg = 'Job failed: canceled (cleaned up on worker restart).';
        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: msg,
        }).eq('id', job.id);
        await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);
        await supabase.from('job_logs').insert({ job_id: job.id, event: 'failed', data: { error: msg } });
      }
      console.log(`[worker] Cleaned up ${stuck.length} stuck canceling job(s)`);
    }
  } catch (err: any) {
    console.error('[worker] Cleanup failed:', err.message);
  }
})();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown() {
  console.log('[worker] Shutting down...');
  cancelAllJobs();
  await flushLogs();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

console.log('[worker] CodeSync worker started, polling for jobs...');
