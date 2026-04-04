import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import { runJob, runFlowJob, loadTaskTypeConfig, cancelJob, cancelAllJobs, cleanupOrphanedJobs } from './runner.js';
import type { FlowConfig } from './runner.js';
import { supabase } from './supabase.js';
import { createCheckpoint, revertToCheckpoint, deleteCheckpoint } from './checkpoint.js';
import { queueNextWorkstreamTask } from './auto-continue.js';
import { ensureWorktree } from './worktree.js';
import { autoCommit, slugify } from './git-utils.js';
import { search as ragSearch } from './rag/service.js';

const execFileAsync = promisify(execFile);

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
  // Cap buffer to prevent OOM if Supabase is unreachable
  const MAX_BUFFER = 1000;
  while (logBuffer.length > MAX_BUFFER) logBuffer.shift();
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

function makeDbCallbacks(jobId: string, task?: any) {
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
      if (task) notifyTaskFailure(task, error).catch(() => {});
    },
  };
}

// ---------------------------------------------------------------------------
// Failure notification helper
// ---------------------------------------------------------------------------

async function notifyTaskFailure(task: any, errorMsg: string): Promise<void> {
  const userId = task.assignee || task.created_by;
  if (!userId) return;
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'task_failed',
      task_id: task.id,
      message: `Task failed: ${task.title} -- ${errorMsg.substring(0, 200)}`,
    });
  } catch { /* best effort */ }
}

// ---------------------------------------------------------------------------
// Start a queued job
// ---------------------------------------------------------------------------

async function startJob(job: any): Promise<void> {
  const jobId: string = job.id;
  let localPath: string = job.local_path;

  // Expand ~ to home directory (Node doesn't do this automatically)
  if (localPath.startsWith('~/')) {
    localPath = localPath.replace('~', process.env.HOME || homedir());
  }

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
        const slug = slugify(ws.name);
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

  // Determine execution path: flow-based (new) or type-based (legacy)
  const flowSnapshot: FlowConfig | null = job.flow_snapshot || null;
  const taskType = flowSnapshot ? null : loadTaskTypeConfig(localPath, task.type);

  // Determine fresh start vs resume
  const phasesAlreadyCompleted: any[] = (job.phases_completed as any[]) || [];
  const isResume = phasesAlreadyCompleted.length > 0;

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
      if (task.auto_continue) {
        // Fatal for auto-continue: no checkpoint = no safety net
        const failMsg = `Checkpoint failed: ${err.message}. Cannot run auto-continue without a safety net.`;
        await writeLog(jobId, 'failed', { error: failMsg });
        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: failMsg,
        }).eq('id', jobId);
        await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
        return;
      }
      await writeLog(jobId, 'log', { text: `[checkpoint] Warning: ${err.message}. Manual revert will not be available.` });
    }
  }

  // Build onReview callback
  const onReview = task.auto_continue === true
    ? async (result: any) => {
        await writeLog(jobId, 'review', result);
        // Auto-approve: mark job done + checkpoint cleaned, task done, clean checkpoint
        const now = new Date().toISOString();
        try { deleteCheckpoint(localPath, jobId); } catch (e: any) { console.warn(`[worker] Checkpoint delete failed for job ${jobId}:`, e.message); }
        await Promise.all([
          supabase.from('jobs').update({ status: 'done', completed_at: now, checkpoint_status: 'cleaned' }).eq('id', jobId),
          supabase.from('tasks').update({ status: 'done', completed_at: now }).eq('id', task.id),
        ]);
        // Auto-commit the changes
        try {
          await autoCommit(localPath, task.type, task.title);
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

  const callbacks = makeDbCallbacks(jobId, task);

  try {
    const taskWithAnswer = isResume ? { ...task, answer: job.answer } : task;

    // RAG injection: search if any flow step uses 'rag' context source, or legacy doc-search type
    const needsRag = flowSnapshot?.steps?.some((s: any) => s.context_sources?.includes('rag'))
      || task.type === 'doc-search';
    if (needsRag) {
      try {
        const ragResults = await ragSearch(job.project_id, task.description || task.title);
        taskWithAnswer._ragResults = ragResults;
        await writeLog(jobId, 'log', { text: `[rag] Found ${ragResults.length} relevant document chunks` });
      } catch (err: any) {
        await writeLog(jobId, 'log', { text: `[rag] Search failed: ${err.message}` });
      }
    }

    const sharedCtx = {
      jobId,
      taskId: task.id,
      projectId: job.project_id,
      localPath,
      phasesAlreadyCompleted,
      ...callbacks,
      onDone: () => {},
      onReview,
    };

    if (flowSnapshot) {
      // New flow-based execution
      await runFlowJob({
        ...sharedCtx,
        task: taskWithAnswer,
        flow: flowSnapshot,
      });
    } else {
      // Legacy type-based execution
      await runJob({
        ...sharedCtx,
        task: taskWithAnswer,
        taskType: taskType!,
      });
    }
  } catch (err: any) {
    // This catch only fires if runJob() itself throws an unhandled error
    // (e.g., a bug in the runner code). Phase failures are handled inside
    // runJob() which updates both job and task status directly.
    console.error(`[worker] Unexpected runner crash for job ${jobId}:`, err.message);
    await writeLog(jobId, 'failed', { error: `Runner crashed: ${err.message}` });
    await supabase.from('jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      question: `Unexpected error: ${err.message}`,
    }).eq('id', jobId);
    await supabase.from('tasks').update({ status: 'paused' }).eq('id', task.id);
    await notifyTaskFailure(task, err.message);
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
        await cancelJob(job.id);

        if (job.local_path) {
          try {
            revertToCheckpoint(job.local_path, job.id);
          } catch (e: any) {
            console.warn(`[worker] Checkpoint revert failed for canceled job ${job.id}:`, e.message);
          }
        }

        await supabase.from('jobs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          question: 'Job failed: canceled by user.',
        }).eq('id', job.id);
        await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
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
        await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
        await supabase.from('job_logs').insert({ job_id: job.id, event: 'failed', data: { error: msg } });
      }
      console.log(`[worker] Cleaned up ${stuck.length} stuck canceling job(s)`);
    }
  } catch (err: any) {
    console.error('[worker] Cleanup failed:', err.message);
  }
})();

// ---------------------------------------------------------------------------
// PR merge polling: check GitHub for merged PRs every 60 seconds
// ---------------------------------------------------------------------------

setInterval(async () => {
  try {
    const { data: workstreams } = await supabase
      .from('workstreams')
      .select('id, name, project_id, pr_url')
      .eq('status', 'complete')
      .not('pr_url', 'is', null);

    if (!workstreams || workstreams.length === 0) return;

    for (const ws of workstreams) {
      try {
        // Parse PR URL: https://github.com/owner/repo/pull/123
        const match = ws.pr_url.match(/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/);
        if (!match) continue;
        const [, repo, prNumber] = match;

        const { stdout } = await execFileAsync('gh', [
          'pr', 'view', prNumber, '--repo', repo, '--json', 'state',
        ], { encoding: 'utf-8', timeout: 10000, env: { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}` } });

        const pr = JSON.parse(stdout.trim());
        if (pr.state === 'MERGED') {
          await supabase.from('workstreams').update({ status: 'merged' }).eq('id', ws.id);
          // Clean up worktree
          try {
            const { data: project } = await supabase
              .from('projects')
              .select('id')
              .eq('id', ws.project_id)
              .single();
            if (project) {
              const { data: member } = await supabase
                .from('project_members')
                .select('local_path')
                .eq('project_id', project.id)
                .not('local_path', 'is', null)
                .limit(1)
                .single();
              if (member?.local_path) {
                const { cleanupWorktree } = await import('./worktree.js');
                cleanupWorktree(member.local_path, slugify(ws.name));
                console.log(`[worker] Cleaned up worktree for workstream ${ws.name}`);
              }
            }
          } catch (err: any) {
            console.log(`[worker] Worktree cleanup failed for ${ws.id}: ${err.message}`);
          }
          console.log(`[worker] PR merged for workstream ${ws.id}`);
        } else if (pr.state === 'CLOSED') {
          // PR was closed without merging -- reset to complete so user can re-create
          await supabase.from('workstreams').update({ status: 'complete' }).eq('id', ws.id);
        }
      } catch {
        // gh CLI error for this PR -- skip silently
      }
    }
  } catch (err: any) {
    console.error('[worker] PR poll error:', err.message);
  }
}, 60000);

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

console.log('[worker] WorkStream worker started, polling for jobs...');
