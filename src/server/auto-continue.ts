import { supabase, hasActiveWorkstreamJob } from './supabase.js';
import { resolveFlowForTask } from './flow-resolution.js';

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
      // Don't set 'complete' — leave status as 'active' so the UI shows
      // "pending review" (derived from allDone) and the user can click
      // "Review & Create PR". The review endpoint sets 'complete' after PR creation.
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

  if (await hasActiveWorkstreamJob(workstreamId)) {
    console.log(`[auto-continue] Workstream ${workstreamId} already has an active job, skipping`);
    return null;
  }

  // Queue the next AI task
  const { flowSnapshot, firstPhase, maxAttempts, flowId } = await resolveFlowForTask(nextTask, projectId, localPath);

  const { data: job, error } = await supabase.from('jobs').insert({
    task_id: nextTask.id,
    project_id: projectId,
    local_path: localPath,
    status: 'queued',
    current_phase: firstPhase,
    max_attempts: maxAttempts,
    flow_id: flowId,
    flow_snapshot: flowSnapshot,
  }).select('id').single();

  if (error) {
    console.error(`[auto-continue] Failed to queue next task ${nextTask.id}:`, error.message);
    return null;
  }

  await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', nextTask.id);
  return job?.id || null;
}
