import { asRecord, isMissingRowError, type DbRecord } from '../authz.js';
import { supabase } from '../supabase.js';

export async function loadReworkTask(taskId: string): Promise<{ task: DbRecord } | { error: string; status: number }> {
  const { data: taskData, error: taskError } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  if (taskError) {
    return {
      status: isMissingRowError(taskError) ? 404 : 400,
      error: isMissingRowError(taskError) ? 'Task not found' : taskError.message,
    };
  }
  const task = asRecord(taskData);
  if (!task) return { status: 404, error: 'Task not found' };
  return { task };
}
