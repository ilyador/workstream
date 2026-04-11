import {
  broadcastCustomTypeChange,
  broadcastDocumentChange,
  broadcastFlowChange,
  broadcastFlowStepChange,
  broadcastJobChange,
  broadcastMemberChange,
  broadcastTaskChange,
  broadcastTaskScopedChange,
  broadcastWorkstreamChange,
} from './realtime-change-handlers.js';
import { startPollingFallback, stopPollingFallback } from './realtime-polling.js';
import { supabase } from './supabase.js';

export function startRealtimeChannel(): void {
  supabase.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, broadcastTaskChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, broadcastJobChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workstreams' }, broadcastWorkstreamChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flows' }, async payload => broadcastFlowChange(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_steps' }, async payload => broadcastFlowStepChange(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_task_types' }, broadcastCustomTypeChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, broadcastMemberChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invites' }, broadcastMemberChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, async payload => broadcastTaskScopedChange(payload, 'comment'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'task_artifacts' }, async payload => broadcastTaskScopedChange(payload, 'artifact'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rag_documents' }, broadcastDocumentChange)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[realtime] Subscribed to project database changes');
        stopPollingFallback();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.error(`[realtime] Channel status ${status}; falling back to polling`);
        startPollingFallback();
      }
    });
}
