import { supabase } from './supabase.js';
import { loadTaskTypeConfig } from './runner.js';

/**
 * Find and queue the next AI task in a workstream after a task completes.
 * Shared by: worker (auto-approve), approve endpoint, task PATCH endpoint.
 * Returns the queued job ID if one was created, null otherwise.
 */
export async function queueNextWorkstreamTask(params: {
  completedTaskId: string;
  projectId: string;
  localPath: string;
  workstreamId: string;
  completedPosition: number;
}): Promise<string | null> {
  const { completedTaskId, projectId, localPath, workstreamId, completedPosition } = params;

  // Find next incomplete task in workstream by position
  const { data: nextTask } = await supabase
    .from('tasks')
    .select('id, type, mode')
    .eq('workstream_id', workstreamId)
    .in('status', ['backlog', 'todo'])
    .gt('position', completedPosition)
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (!nextTask) {
    // No more tasks — check if workstream is fully complete
    const { data: remaining } = await supabase
      .from('tasks')
      .select('id')
      .eq('workstream_id', workstreamId)
      .not('status', 'eq', 'done')
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await supabase.from('workstreams').update({ status: 'complete' }).eq('id', workstreamId);
    }
    return null;
  }

  // Human tasks pause the chain
  if (nextTask.mode === 'human') {
    return null;
  }

  // Queue the next AI task
  const nextTaskType = loadTaskTypeConfig(localPath, nextTask.type);
  const { data: job, error } = await supabase.from('jobs').insert({
    task_id: nextTask.id,
    project_id: projectId,
    local_path: localPath,
    status: 'queued',
    current_phase: nextTaskType.phases[0],
    max_attempts: nextTaskType.verify_retries + 1,
  }).select('id').single();

  if (error) {
    console.error(`[auto-continue] Failed to queue next task ${nextTask.id}:`, error.message);
    return null;
  }

  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', nextTask.id);
  return job?.id || null;
}
