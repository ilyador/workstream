import { asRecord, isMissingRowError, isProjectMember, stringField, type DbRecord } from '../authz.js';
import { supabase } from '../supabase.js';

const TASK_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'paused', 'review', 'done', 'canceled']);
const TASK_MODES = new Set(['ai', 'human']);
const TASK_EFFORTS = new Set(['low', 'medium', 'high', 'max']);
const TASK_MULTIAGENT = new Set(['auto', 'yes']);
const TASK_PRIORITIES = new Set(['critical', 'upcoming', 'backlog']);
const TASK_CHAINING = new Set(['none', 'accept', 'produce', 'both']);

function validateEnumField(updates: DbRecord, key: string, allowed: Set<string>, label: string): string | null {
  if (!(key in updates) || updates[key] == null || updates[key] === '') return null;
  return typeof updates[key] === 'string' && allowed.has(updates[key]) ? null : `${label} is invalid`;
}

function validateStringField(updates: DbRecord, key: string, label: string, allowEmpty = true): string | null {
  if (!(key in updates) || updates[key] == null) return null;
  if (typeof updates[key] !== 'string') return `${label} must be a string`;
  if (!allowEmpty && updates[key].trim().length === 0) return `${label} cannot be empty`;
  return null;
}

function normalizeNullableString(updates: DbRecord, key: string, label: string): string | null {
  if (!(key in updates)) return null;
  const value = updates[key];
  if (value == null || value === '') {
    updates[key] = null;
    return null;
  }
  return typeof value === 'string' ? null : `${label} must be a string`;
}

export function validateTaskShape(updates: DbRecord): string | null {
  return validateStringField(updates, 'title', 'title', false)
    || validateStringField(updates, 'description', 'description')
    || validateStringField(updates, 'type', 'type', false)
    || validateStringField(updates, 'followup_notes', 'followup_notes')
    || validateEnumField(updates, 'status', TASK_STATUSES, 'status')
    || validateEnumField(updates, 'mode', TASK_MODES, 'mode')
    || validateEnumField(updates, 'effort', TASK_EFFORTS, 'effort')
    || validateEnumField(updates, 'multiagent', TASK_MULTIAGENT, 'multiagent')
    || validateEnumField(updates, 'priority', TASK_PRIORITIES, 'priority')
    || validateEnumField(updates, 'chaining', TASK_CHAINING, 'chaining');
}

export function validateTaskScalars(updates: DbRecord): string | null {
  if ('auto_continue' in updates && updates.auto_continue != null && typeof updates.auto_continue !== 'boolean') {
    return 'auto_continue must be a boolean';
  }
  if ('images' in updates && updates.images != null && (!Array.isArray(updates.images) || !updates.images.every(image => typeof image === 'string'))) {
    return 'images must be an array of strings';
  }
  if (
    'position' in updates
    && updates.position != null
    && (typeof updates.position !== 'number' || !Number.isInteger(updates.position) || updates.position < 0)
  ) {
    return 'position must be a non-negative integer';
  }
  return null;
}

async function validateProjectReference(
  table: string,
  id: unknown,
  projectId: string,
  errorLabel: string,
): Promise<string | null> {
  if (id == null || id === '') return null;
  if (typeof id !== 'string') return `${errorLabel} must be a string`;
  const { data, error } = await supabase.from(table).select('project_id').eq('id', id).single();
  if (error) return isMissingRowError(error) ? `${errorLabel} not found` : error.message;
  const record = asRecord(data);
  if (!record) return `${errorLabel} not found`;
  if (stringField(record, 'project_id') !== projectId) return `${errorLabel} does not belong to this project`;
  return null;
}

export async function validateTaskReferences(body: DbRecord, projectId: string): Promise<string | null> {
  const normalizeError = normalizeNullableString(body, 'workstream_id', 'workstream_id')
    || normalizeNullableString(body, 'flow_id', 'flow_id')
    || normalizeNullableString(body, 'assignee', 'assignee');
  if (normalizeError) return normalizeError;

  const workstreamError = await validateProjectReference('workstreams', body.workstream_id, projectId, 'workstream_id');
  if (workstreamError) return workstreamError;

  const flowError = await validateProjectReference('flows', body.flow_id, projectId, 'flow_id');
  if (flowError) return flowError;

  const assignee = body.assignee;
  if (assignee != null && assignee !== '') {
    if (typeof assignee !== 'string') return 'assignee must be a string';
    if (!await isProjectMember(projectId, assignee)) return 'assignee must be a project member';
  }

  return null;
}
