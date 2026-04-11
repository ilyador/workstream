import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  broadcastCustomTypeChange,
  broadcastDocumentChange,
  broadcastFlowChange,
  broadcastFlowStepChange,
  broadcastJobChange,
  broadcastMemberChange,
  broadcastNotificationChange,
  broadcastTaskChange,
  broadcastTaskScopedChange,
  broadcastWorkstreamChange,
} from './realtime-change-handlers.js';
import { startPollingFallback, stopPollingFallback } from './realtime-polling.js';
import { supabase } from './supabase.js';
import type { RealtimePayload } from './realtime-payload.js';

// Supabase realtime silently drops `postgres_changes` bindings beyond ~4 per
// channel: the subscribe callback still fires SUBSCRIBED, but no events
// arrive. One channel per table is the safe pattern.
type Handler = (payload: RealtimePayload) => void | Promise<void>;

const TABLE_HANDLERS: Array<{ table: string; handler: Handler }> = [
  { table: 'tasks', handler: broadcastTaskChange },
  { table: 'jobs', handler: broadcastJobChange },
  { table: 'workstreams', handler: broadcastWorkstreamChange },
  { table: 'flows', handler: broadcastFlowChange },
  { table: 'flow_steps', handler: broadcastFlowStepChange },
  { table: 'custom_task_types', handler: broadcastCustomTypeChange },
  { table: 'project_members', handler: broadcastMemberChange },
  { table: 'project_invites', handler: broadcastMemberChange },
  { table: 'comments', handler: (payload) => broadcastTaskScopedChange(payload, 'comment') },
  { table: 'task_artifacts', handler: (payload) => broadcastTaskScopedChange(payload, 'artifact') },
  { table: 'rag_documents', handler: broadcastDocumentChange },
  { table: 'notifications', handler: broadcastNotificationChange },
  { table: 'realtime_delete_events', handler: handleDeleteEvent },
];

const TABLE_HANDLER_MAP = new Map<string, Handler>(TABLE_HANDLERS.map(({ table, handler }) => [table, handler]));

// DELETE events lose their row payload through Supabase realtime's RLS
// stripping (even for service_role). Migration 00039 writes the full OLD
// row to realtime_delete_events on every delete, and this handler routes
// those INSERTs back to the matching broadcast handler with a synthetic
// DELETE payload.
async function handleDeleteEvent(payload: RealtimePayload): Promise<void> {
  const row = payload.new as { table_name?: string; old_row?: Record<string, unknown> } | null;
  if (!row || typeof row.table_name !== 'string' || !row.old_row) return;

  const originalTable = row.table_name;
  // Guard against the purge RPC deleting rows from realtime_delete_events
  // itself — the trigger would fire, re-enter this handler, and recurse.
  if (originalTable === 'realtime_delete_events') return;

  const handler = TABLE_HANDLER_MAP.get(originalTable);
  if (!handler) return;
  await handler({ eventType: 'DELETE', new: {}, old: row.old_row });
}

let subscribedCount = 0;
let fallbackActive = false;

function onStatus(table: string, status: string): void {
  if (status === 'SUBSCRIBED') {
    subscribedCount++;
    if (subscribedCount === TABLE_HANDLERS.length) {
      console.log(`[realtime] Subscribed to ${subscribedCount} tables`);
      if (fallbackActive) {
        stopPollingFallback();
        fallbackActive = false;
      }
    }
    return;
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    console.error(`[realtime] ${table} channel status ${status}; falling back to polling`);
    if (!fallbackActive) {
      startPollingFallback();
      fallbackActive = true;
    }
  }
}

const DELETE_EVENTS_PURGE_INTERVAL_MS = 5 * 60 * 1000;
let purgeTimer: NodeJS.Timeout | null = null;

async function purgeOldDeleteEvents(): Promise<void> {
  const { error } = await supabase.rpc('purge_realtime_delete_events', { p_max_age_seconds: 300 });
  if (error) console.error('[realtime] Failed to purge old delete events:', error.message);
}

export function startRealtimeChannel(): void {
  subscribedCount = 0;
  for (const { table, handler } of TABLE_HANDLERS) {
    const channel: RealtimeChannel = supabase.channel(`db-changes:${table}`);
    channel
      .on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table } as never,
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          void handler(payload as unknown as RealtimePayload);
        },
      )
      .subscribe((status) => onStatus(table, status));
  }

  if (purgeTimer) clearInterval(purgeTimer);
  purgeTimer = setInterval(() => void purgeOldDeleteEvents(), DELETE_EVENTS_PURGE_INTERVAL_MS);
  void purgeOldDeleteEvents();
}
