import { resolveFlowForTask } from './flow-resolution.js';
import { supabase } from './supabase.js';
import type { AutoContinueTask } from './auto-continue-types.js';

export async function queueAiTask(params: {
  task: AutoContinueTask;
  projectId: string;
  localPath: string;
}): Promise<string | null> {
  const { task, projectId, localPath } = params;
  let flowConfig: Awaited<ReturnType<typeof resolveFlowForTask>>;
  try {
    flowConfig = await resolveFlowForTask(task, projectId);
  } catch (error) {
    console.error(`[auto-continue] Failed to resolve flow for task ${task.id}:`, error instanceof Error ? error.message : error);
    return null;
  }

  const { data: updatedTask, error: taskUpdateError } = await supabase
    .from('tasks')
    .update({ status: 'in_progress' })
    .eq('id', task.id)
    .in('status', ['backlog', 'todo'])
    .select('id')
    .maybeSingle();

  if (taskUpdateError) {
    console.error(`[auto-continue] Failed to mark task ${task.id} in progress:`, taskUpdateError.message);
    return null;
  }
  if (!updatedTask) {
    console.warn(`[auto-continue] Task ${task.id} is no longer eligible for auto-continue (status changed)`);
    return null;
  }

  const { data: job, error } = await supabase.from('jobs').insert({
    task_id: task.id,
    project_id: projectId,
    local_path: localPath,
    status: 'queued',
    current_phase: flowConfig.firstPhase,
    max_attempts: flowConfig.maxAttempts,
    flow_id: flowConfig.flowId,
    flow_snapshot: flowConfig.flowSnapshot,
  }).select('id').single();

  if (error) {
    console.error(`[auto-continue] Failed to queue next task ${task.id}:`, error.message);
    const { error: rollbackError } = await supabase
      .from('tasks')
      .update({ status: 'todo' })
      .eq('id', task.id)
      .select('id')
      .maybeSingle();
    if (rollbackError) console.error(`[auto-continue] Failed to roll back task ${task.id} to todo:`, rollbackError.message);
    return null;
  }

  return job?.id || null;
}
