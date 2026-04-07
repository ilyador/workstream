import { supabase } from './supabase.js';
import type { AutoContinueTask } from './auto-continue-types.js';

export async function markHumanTaskInProgress(task: AutoContinueTask, workstreamId: string): Promise<void> {
  const { error: updateError } = await supabase.from('tasks').update({ status: 'in_progress' }).eq('id', task.id);
  if (updateError) {
    console.error(`[auto-continue] Failed to mark human task ${task.id} in progress:`, updateError.message);
    return;
  }

  if (task.assignee && task.assignee !== task.created_by) {
    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: task.assignee,
      type: 'human_task',
      task_id: task.id,
      message: `A task needs your attention: ${task.title}`,
    });
    if (notificationError) {
      console.error(`[auto-continue] Failed to notify assignee for task ${task.id}:`, notificationError.message);
    }
  }

  console.log(`[auto-continue] Workstream ${workstreamId} paused - waiting for human task "${task.title}" (${task.id})`);
}
