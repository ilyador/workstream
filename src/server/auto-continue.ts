import { supabase } from './supabase.js';
import { loadTaskTypeConfig, buildFlowSnapshot } from './runner.js';

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
    .select('id, type, mode, title, assignee, created_by, flow_id')
    .eq('workstream_id', workstreamId)
    .in('status', ['backlog', 'todo'])
    .gt('position', completedPosition)
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (!nextTask) {
    // No more tasks — check if workstream is fully complete
    // Only mark complete when all tasks are done or canceled (not paused/in_progress)
    const { data: remaining } = await supabase
      .from('tasks')
      .select('id')
      .eq('workstream_id', workstreamId)
      .not('status', 'in', '("done","canceled")')
      .limit(1);

    if (!remaining || remaining.length === 0) {
      await supabase.from('workstreams').update({ status: 'complete' }).eq('id', workstreamId);
    }
    return null;
  }

  // Human tasks pause the chain — mark in_progress and notify assignee
  if (nextTask.mode === 'human') {
    await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', nextTask.id);

    if (nextTask.assignee && nextTask.assignee !== nextTask.created_by) {
      await supabase.from('notifications').insert({
        user_id: nextTask.assignee,
        type: 'human_task',
        task_id: nextTask.id,
        message: `A task needs your attention: ${nextTask.title}`,
      });
    }

    console.log(`[auto-continue] Workstream ${workstreamId} paused — waiting for human task "${nextTask.title}" (${nextTask.id})`);
    return null;
  }

  // Queue the next AI task
  const nextTaskType = loadTaskTypeConfig(localPath, nextTask.type);
  const jobPayload: Record<string, unknown> = {
    task_id: nextTask.id,
    project_id: projectId,
    local_path: localPath,
    status: 'queued',
    current_phase: nextTaskType.phases[0],
    max_attempts: nextTaskType.verify_retries + 1,
  };

  if (nextTask.flow_id) {
    const { data: flow } = await supabase
      .from('flows')
      .select('*, flow_steps(*)')
      .eq('id', nextTask.flow_id)
      .single();
    if (flow) {
      jobPayload.flow_id = nextTask.flow_id;
      jobPayload.flow_snapshot = buildFlowSnapshot(flow);
    }
  }

  const { data: job, error } = await supabase.from('jobs').insert(jobPayload).select('id').single();

  if (error) {
    console.error(`[auto-continue] Failed to queue next task ${nextTask.id}:`, error.message);
    return null;
  }

  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', nextTask.id);
  return job?.id || null;
}
