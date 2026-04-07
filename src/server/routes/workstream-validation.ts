import { isProjectMember } from '../authz.js';

const WORKSTREAM_STATUSES = new Set(['active', 'paused', 'complete', 'archived', 'reviewing', 'review_failed', 'merged']);

export async function normalizeWorkstreamUpdates(updates: Record<string, unknown>, projectId: string): Promise<string | null> {
  if ('status' in updates && (typeof updates.status !== 'string' || !WORKSTREAM_STATUSES.has(updates.status))) {
    return 'status is invalid';
  }
  if (
    'position' in updates
    && updates.position != null
    && (typeof updates.position !== 'number' || !Number.isInteger(updates.position) || updates.position < 0)
  ) {
    return 'position must be a non-negative integer';
  }
  if ('description' in updates && updates.description != null && typeof updates.description !== 'string') {
    return 'description must be a string';
  }
  if ('has_code' in updates && updates.has_code != null && typeof updates.has_code !== 'boolean') {
    return 'has_code must be a boolean';
  }
  if (typeof updates.name === 'string') updates.name = updates.name.trim();
  if ('name' in updates && (typeof updates.name !== 'string' || updates.name.length === 0)) {
    return 'name cannot be empty';
  }
  if ('reviewer_id' in updates && (updates.reviewer_id == null || updates.reviewer_id === '')) {
    updates.reviewer_id = null;
  }
  if (updates.reviewer_id && typeof updates.reviewer_id === 'string') {
    if (!await isProjectMember(projectId, updates.reviewer_id)) {
      return 'reviewer_id must be a project member';
    }
  } else if (updates.reviewer_id != null) {
    return 'reviewer_id must be a string';
  }
  return null;
}
