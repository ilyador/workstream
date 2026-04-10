import { resolveFlowForTask } from '../flow-resolution.js';
import { hasActiveWorkstreamJob, supabase } from '../supabase.js';
import { flowTask } from './execution-helpers.js';

export async function activeWorkstreamJobId(workstreamId: string): Promise<{ jobId: string | null } | { error: string }> {
  try {
    return { jobId: await hasActiveWorkstreamJob(workstreamId) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to check active workstream jobs' };
  }
}

export async function createQueuedRunJob(params: {
  task: Record<string, unknown>;
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<{ jobId: string } | { error: string }> {
  const flowCompatibleTask = flowTask(params.task);
  if (!flowCompatibleTask) return { error: 'Task type is required' };

  let flowConfig: Awaited<ReturnType<typeof resolveFlowForTask>>;
  try {
    flowConfig = await resolveFlowForTask(flowCompatibleTask, params.projectId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to resolve flow' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      task_id: params.taskId,
      project_id: params.projectId,
      local_path: params.localPath,
      status: 'queued',
      current_phase: flowConfig.firstPhase,
      max_attempts: flowConfig.maxAttempts,
      flow_id: flowConfig.flowId,
      flow_snapshot: flowConfig.flowSnapshot,
    })
    .select()
    .single();
  if (jobErr || !job) return { error: jobErr?.message || 'Failed to create job' };

  const { error: taskUpdateErr } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', params.taskId);
  if (taskUpdateErr) {
    const { error: cleanupError } = await supabase.from('jobs').delete().eq('id', job.id);
    if (cleanupError) console.error(`[run] Failed to clean up queued job ${job.id}:`, cleanupError.message);
    return { error: taskUpdateErr.message };
  }

  return { jobId: job.id };
}
