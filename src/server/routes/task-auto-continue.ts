import type { Request } from 'express';
import { queueNextWorkstreamTask } from '../auto-continue.js';
import { asRecord, getUserId, isLocalPathAllowed, stringField } from '../authz.js';
import { supabase } from '../supabase.js';

function numericField(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

export async function maybeQueueTaskAutoContinue(req: Request, taskValue: unknown): Promise<void> {
  const task = asRecord(taskValue);
  if (!task || task.auto_continue !== true) return;

  const taskId = stringField(task, 'id');
  const projectId = stringField(task, 'project_id');
  const workstreamId = stringField(task, 'workstream_id');
  const completedPosition = numericField(task, 'position');
  if (!taskId || !projectId || !workstreamId || completedPosition == null) return;

  try {
    const userId = getUserId(req);
    const { data: member, error: memberError } = await supabase
      .from('project_members')
      .select('local_path')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();
    if (memberError) {
      console.error('[auto-continue] Failed to load member local_path:', memberError.message);
      return;
    }
    if (member?.local_path && isLocalPathAllowed({ role: 'dev', local_path: member.local_path }, member.local_path)) {
      await queueNextWorkstreamTask({
        projectId,
        localPath: member.local_path,
        workstreamId,
        completedPosition,
      });
    } else if (member?.local_path) {
      console.error('[auto-continue] Skipping queue because member local_path is no longer authorized');
    }
  } catch (error) {
    console.error('[auto-continue] Error:', error instanceof Error ? error.message : error);
  }
}
