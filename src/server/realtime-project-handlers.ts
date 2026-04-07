import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';

export function broadcastCustomTypeChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, { type: 'custom_type_changed' });
}

export function broadcastMemberChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, { type: 'member_changed' });
}
