import { asRecord, type DbRecord } from '../authz.js';
import { resolveFlowForTask } from '../flow-resolution.js';
import { supabase } from '../supabase.js';
import { flowTask } from './execution-helpers.js';

export async function queueReworkJob(params: {
  task: DbRecord;
  taskId: string;
  projectId: string;
  localPath: string;
}): Promise<{ job: DbRecord } | { error: string; status: number }> {
  const flowCompatibleTask = flowTask(params.task);
  if (!flowCompatibleTask) return { status: 400, error: 'Task type is required' };

  let flowConfig: Awaited<ReturnType<typeof resolveFlowForTask>>;
  try {
    flowConfig = await resolveFlowForTask(flowCompatibleTask, params.projectId);
  } catch (error) {
    return { status: 500, error: error instanceof Error ? error.message : 'Failed to resolve flow' };
  }

  const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
    task_id: params.taskId,
    project_id: params.projectId,
    local_path: params.localPath,
    status: 'queued',
    current_phase: flowConfig.firstPhase,
    max_attempts: flowConfig.maxAttempts,
    flow_id: flowConfig.flowId,
    flow_snapshot: flowConfig.flowSnapshot,
  }).select().single();

  const job = asRecord(newJob);
  if (jobErr || !job) return { status: 500, error: jobErr?.message || 'Failed to create rework job' };
  return { job };
}
