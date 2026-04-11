import { supabase } from './supabase.js';
import {
  getActiveProcessCount,
  cancelJob as cancelJobImpl,
  cancelAllJobs as cancelAllJobsImpl,
} from './process-lifecycle.js';

export type { FlowConfig, FlowStepConfig } from './flow-config.js';

export {
  runFlowJob,
  scanAndUploadArtifacts,
  type FlowJobContext,
} from './flow/orchestrator.js';

export { buildStepPrompt } from './flow/prompt-builder.js';

export const cancelJob = cancelJobImpl;
export const cancelAllJobs = cancelAllJobsImpl;

/**
 * Clean up orphaned jobs on server startup.
 * Any job with status 'running' that has no active process is orphaned
 * (server was restarted while it was running).
 */
export async function cleanupOrphanedJobs(): Promise<number> {
  const { data: runningJobs } = await supabase
    .from('jobs')
    .select('id, task_id, started_at')
    .in('status', ['running']);

  if (!runningJobs || runningJobs.length === 0) return 0;

  let cleaned = 0;
  for (const job of runningJobs) {
    if (getActiveProcessCount(job.id) === 0) {
      const elapsed = Date.now() - new Date(job.started_at).getTime();
      const elapsedMin = Math.round(elapsed / 60000);

      const failMsg = `Job failed: worker was restarted while this job was running (after ${elapsedMin}m). Click "Run" on the task to retry.`;
      await supabase.from('jobs').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        question: failMsg,
      }).eq('id', job.id);

      const { error: taskErr } = await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
      if (taskErr) {
        console.error(`[runner] Failed to update task ${job.task_id} to paused, retrying:`, taskErr.message);
        const { error: retryErr } = await supabase.from('tasks').update({ status: 'paused' }).eq('id', job.task_id);
        if (retryErr) {
          console.error(`[runner] Retry also failed for task ${job.task_id}:`, retryErr.message);
          throw new Error(`Failed to update task ${job.task_id} to paused: ${retryErr.message}`);
        }
      }

      // Write to job_logs so SSE clients see the terminal event
      await supabase.from('job_logs').insert({
        job_id: job.id,
        event: 'failed',
        data: { error: failMsg },
      });

      cleaned++;
      console.log(`Cleaned orphaned job ${job.id} (was running for ${elapsedMin}m)`);
    }
  }
  return cleaned;
}
