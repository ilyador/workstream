import { isMissingRowError } from './authz.js';
import type { BotAction } from './bot-action-types.js';
import { supabase } from './supabase.js';

const BOT_TASK_TYPES = new Set(['bug-fix', 'feature', 'refactor', 'test', 'chore']);
const BOT_TASK_UPDATE_STATUSES = new Set(['backlog', 'done', 'canceled']);

export async function createTask(action: BotAction, projectId: string): Promise<string> {
  const title = typeof action.params.title === 'string' ? action.params.title.trim() : '';
  const type = typeof action.params.type === 'string' ? action.params.type : 'feature';
  const description = typeof action.params.description === 'string' ? action.params.description : '';
  const workstreamId = typeof action.params.workstream_id === 'string' ? action.params.workstream_id : null;
  if (!title) return 'Failed to create task: title is required';
  if (!BOT_TASK_TYPES.has(type)) return `Failed to create task: type must be one of ${Array.from(BOT_TASK_TYPES).join(', ')}`;
  if (workstreamId) {
    const { data: workstream, error: workstreamError } = await supabase.from('workstreams').select('project_id').eq('id', workstreamId).single();
    if (workstreamError) {
      if (isMissingRowError(workstreamError)) return 'Failed to create task: workstream_id not found';
      console.error(`[bot] Failed to load workstream ${workstreamId}:`, workstreamError.message);
      return 'Failed to create task: could not load workstream';
    }
    if (workstream?.project_id !== projectId) return 'Failed to create task: workstream_id does not belong to this project';
  }
  const { data: maxTask, error: maxTaskError } = await supabase
    .from('tasks')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1)
    .single();
  if (maxTaskError && !isMissingRowError(maxTaskError)) {
    console.error('[bot] Failed to load max task position:', maxTaskError.message);
    return 'Failed to create task: could not load project tasks';
  }

  const { data, error } = await supabase.from('tasks').insert({
    project_id: projectId,
    title,
    type,
    description,
    workstream_id: workstreamId,
    position: (maxTask?.position ?? 0) + 1,
  }).select().single();

  if (error) {
    console.error('[bot] Failed to insert task:', error.message);
    return 'Failed to create task';
  }
  return `Created task "${data.title}" (${data.id})`;
}

export async function updateTask(action: BotAction, projectId: string): Promise<string> {
  const taskId = typeof action.params.task_id === 'string' ? action.params.task_id : '';
  if (!taskId) return 'Failed to update task: task_id is required';
  const { data: taskRow, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
  if (taskError) {
    if (isMissingRowError(taskError)) return 'Failed to update task: task_id not found';
    console.error(`[bot] Failed to load task ${taskId}:`, taskError.message);
    return 'Failed to update task: could not load task';
  }
  if (taskRow?.project_id !== projectId) return 'Failed to update task: task_id does not belong to this project';

  const clean: Record<string, unknown> = {};
  if (typeof action.params.status === 'string') clean.status = action.params.status;
  if (typeof action.params.title === 'string') clean.title = action.params.title.trim();
  if (typeof action.params.description === 'string') clean.description = action.params.description;
  if (Object.keys(clean).length === 0) return 'Failed to update task: no supported fields provided';
  if (clean.title === '') return 'Failed to update task: title cannot be empty';
  if (typeof clean.status === 'string' && !BOT_TASK_UPDATE_STATUSES.has(clean.status)) return 'Failed to update task: unsupported status';

  if (clean.status === 'done') clean.completed_at = new Date().toISOString();
  else if (typeof clean.status === 'string') clean.completed_at = null;
  const { error } = await supabase.from('tasks').update(clean).eq('id', taskId);
  if (error) {
    console.error(`[bot] Failed to update task ${taskId}:`, error.message);
    return 'Failed to update task';
  }
  return `Updated task ${taskId}`;
}

export async function addComment(action: BotAction, projectId: string): Promise<string> {
  const taskId = typeof action.params.task_id === 'string' ? action.params.task_id : '';
  const message = typeof action.params.message === 'string' ? action.params.message.trim() : '';
  if (!taskId || !message) return 'Failed to add comment: task_id and message are required';
  const { data: taskRow, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', taskId).single();
  if (taskError) return `Failed to add comment: ${isMissingRowError(taskError) ? 'task_id not found' : taskError.message}`;
  if (taskRow?.project_id !== projectId) return 'Failed to add comment: task_id does not belong to this project';
  const { data: botProfile, error: botProfileError } = await supabase
    .from('profiles')
    .select('id')
    .eq('name', 'WorkStream Bot')
    .limit(1)
    .single();
  if (botProfileError && !isMissingRowError(botProfileError)) {
    console.error('[bot] Failed to load bot profile:', botProfileError.message);
    return 'Failed to add comment: could not resolve commenter';
  }
  let userId = botProfile?.id;
  if (!userId && taskRow?.project_id) {
    const { data: proj, error: projectError } = await supabase.from('projects').select('created_by').eq('id', taskRow.project_id).single();
    if (projectError) {
      if (isMissingRowError(projectError)) return 'Failed to add comment: project not found';
      console.error('[bot] Failed to load project for comment:', projectError.message);
      return 'Failed to add comment: could not load project';
    }
    userId = proj?.created_by;
  }
  if (!userId) return 'No user found for comments';
  const { error } = await supabase.from('comments').insert({ task_id: taskId, user_id: userId, body: message });
  if (error) {
    console.error(`[bot] Failed to insert comment on task ${taskId}:`, error.message);
    return 'Failed to add comment';
  }
  return `Comment added to ${taskId}`;
}
