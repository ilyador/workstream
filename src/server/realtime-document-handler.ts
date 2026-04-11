import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';

export function broadcastDocumentChange(payload: RealtimePayload): void {
  const record = projectRecord(payload);
  const projectId = stringField(record, 'project_id');
  if (!projectId) return;
  broadcast(projectId, { type: 'document_changed' });
}
