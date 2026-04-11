import { lookupProjectId } from './realtime-core-handlers.js';
import { broadcast } from './realtime-listeners.js';
import { projectRecord, stringField, type RealtimePayload } from './realtime-payload.js';

export async function broadcastNotificationChange(payload: RealtimePayload): Promise<void> {
  const record = projectRecord(payload);
  const taskId = stringField(record, 'task_id');
  const workstreamId = stringField(record, 'workstream_id');

  let projectId: string | null = null;
  if (taskId) {
    projectId = await lookupProjectId('tasks', taskId);
  } else if (workstreamId) {
    projectId = await lookupProjectId('workstreams', workstreamId);
  }
  if (!projectId) return;

  broadcast(projectId, { type: 'notification_changed' });
}
