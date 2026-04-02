import 'dotenv/config';
import { runJob, loadTaskTypeConfig, cancelJob, cancelAllJobs, cleanupOrphanedJobs } from './runner.js';
import { supabase } from './supabase.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from './checkpoint.js';

// ---------------------------------------------------------------------------
// DB logging
// ---------------------------------------------------------------------------

async function writeLog(jobId: string, event: string, data: Record<string, any> = {}): Promise<void> {
  await supabase.from('job_logs').insert({ job_id: jobId, event, data });
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
  const localPath: string = job.local_path;

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
        await writeLog(jobId, 'done', {});
        // Queue next task in workstream
        maybeQueueNextTask(task.id, job.project_id, localPath).catch((err: any) => {
          console.error('[worker] maybeQueueNextTask error:', err.message);
        });
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
      onReview,
    });
  } catch (err: any) {
    writeLog(jobId, 'failed', { error: err.message }).then().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Auto-continue: queue next task in workstream
// ---------------------------------------------------------------------------

async function maybeQueueNextTask(completedTaskId: string, projectId: string, localPath: string): Promise<void> {
  const { data: task } = await supabase
    .from('tasks')
    .select('id, auto_continue, workstream_id, position, mode')
    .eq('id', completedTaskId)
    .single();

  if (!task) return;
  if (task.auto_continue !== true) return;
  if (task.workstream_id == null) return;

  // Find next task in the workstream by position
  const { data: nextTask } = await supabase
    .from('tasks')
    .select('id, type, mode, auto_continue')
    .eq('workstream_id', task.workstream_id)
    .in('status', ['backlog', 'todo'])
    .gt('position', task.position)
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (!nextTask) {
    // No more tasks — check if workstream is fully complete
    const { data: remaining } = await supabase
      .from('tasks')
      .select('id')
      .eq('workstream_id', task.workstream_id)
      .not('status', 'eq', 'done')
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await supabase.from('workstreams').update({ status: 'complete' }).eq('id', task.workstream_id);
      console.log(`[worker] Workstream ${task.workstream_id} complete`);
    }
    return;
  }

  // If next task is human mode, pause the chain
  if (nextTask.mode === 'human') {
    await writeLog(completedTaskId, 'workstream_paused', {
      workstreamId: task.workstream_id,
      nextTaskId: nextTask.id,
      reason: 'Next task requires human action',
    });
    console.log(`[worker] Workstream paused — next task ${nextTask.id} is human mode`);
    return;
  }

  // Insert a new queued job for the next task
  const { error: insertErr } = await supabase.from('jobs').insert({
    task_id: nextTask.id,
    project_id: projectId,
    status: 'queued',
    local_path: localPath,
  });

  if (insertErr) {
    console.error(`[worker] Failed to queue next task ${nextTask.id}:`, insertErr.message);
  } else {
    console.log(`[worker] Queued next task ${nextTask.id} in workstream`);
  }
}

// ---------------------------------------------------------------------------
// Poll loop: pick up queued jobs
// ---------------------------------------------------------------------------

let busyJobId: string | null = null;

setInterval(async () => {
  if (busyJobId) return;

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!jobs || jobs.length === 0) return;

  const job = jobs[0];
  busyJobId = job.id;
  console.log(`[worker] Picked up job ${job.id} for task ${job.task_id}`);

  startJob(job)
    .catch((err) => console.error(`[worker] startJob error: ${err.message}`))
    .finally(() => { busyJobId = null; });
}, 1000);

// ---------------------------------------------------------------------------
// Cancellation loop: handle jobs marked as canceling
// ---------------------------------------------------------------------------

setInterval(async () => {
  const { data: cancelingJobs } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'canceling');

  if (!cancelingJobs || cancelingJobs.length === 0) return;

  for (const job of cancelingJobs) {
    console.log(`[worker] Canceling job ${job.id}`);

    // Kill the child process
    cancelJob(job.id);

    // Revert checkpoint if local_path exists
    if (job.local_path) {
      try {
        revertToCheckpoint(job.local_path, job.id);
        console.log(`[worker] Reverted checkpoint for job ${job.id}`);
      } catch (err: any) {
        console.error(`[worker] Revert failed for job ${job.id}: ${err.message}`);
      }
    }

    // Mark failed
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: 'Job failed: canceled by user. Changes have been reverted.',
    }).eq('id', job.id);

    // Move task back to backlog
    await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);

    await writeLog(job.id, 'failed', { error: 'Job canceled by user' });
  }
}, 1000);

// ---------------------------------------------------------------------------
// Orphan cleanup on startup
// ---------------------------------------------------------------------------

cleanupOrphanedJobs().then((count) => {
  if (count > 0) console.log(`[worker] Cleaned up ${count} orphaned jobs`);
}).catch((err) => {
  console.error('[worker] Orphan cleanup failed:', err.message);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log('[worker] Shutting down...');
  cancelAllJobs();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

console.log('[worker] CodeSync worker started, polling for jobs...');
