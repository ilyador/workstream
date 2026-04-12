import { isMissingRowError } from './authz.js';
import { supabase } from './supabase.js';
import type { AutoContinueTask } from './auto-continue-types.js';

export async function findNextWorkstreamTask(params: {
  projectId: string;
  workstreamId: string;
  completedPosition: number;
}): Promise<AutoContinueTask | null> {
  const { projectId, workstreamId, completedPosition } = params;
  const { data: nextTask, error } = await supabase
    .from('tasks')
    .select('id, project_id, type, mode, title, assignee, created_by, flow_id')
    .eq('workstream_id', workstreamId)
    .eq('project_id', projectId)
    .in('status', ['backlog', 'todo'])
    .gt('position', completedPosition)
    .order('position', { ascending: true })
    .limit(1)
    .single();
  if (error && !isMissingRowError(error)) {
    console.error(`[auto-continue] Failed to find next task for workstream ${workstreamId}:`, error.message);
    return null;
  }
  return nextTask || null;
}

export async function checkWorkstreamHasOnlyFinishedTasks(workstreamId: string): Promise<void> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('workstream_id', workstreamId)
    .not('status', 'in', '("done","canceled")')
    .limit(1);
  if (error) {
    console.error(`[auto-continue] Failed to check remaining tasks for workstream ${workstreamId}:`, error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`[auto-continue] Workstream ${workstreamId} is complete — all tasks are done or canceled`);
    return;
  }
  console.warn(`[auto-continue] Workstream ${workstreamId} has unfinished tasks but no next auto-continuable task was found`);
}
