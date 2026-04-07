import { subscribeToChanges, type Flow, type TaskRecord, type WorkstreamRecord } from '../lib/api';
import type { JobRecord } from '../components/job-types';

export type ProjectEvent =
  | { type: 'task_changed'; task: TaskRecord }
  | { type: 'task_deleted'; task: TaskRecord }
  | { type: 'job_changed'; job: JobRecord }
  | { type: 'job_deleted'; job: JobRecord }
  | { type: 'artifact_changed'; task_id: string }
  | { type: 'artifact_deleted'; task_id: string }
  | { type: 'comment_changed'; task_id: string }
  | { type: 'comment_deleted'; task_id: string }
  | { type: 'flow_changed'; flow: Flow }
  | { type: 'flow_deleted'; flow_id: string }
  | { type: 'workstream_changed'; workstream: WorkstreamRecord }
  | { type: 'workstream_deleted'; workstream_id: string }
  | { type: 'member_changed' }
  | { type: 'custom_type_changed' }
  | { type: 'full_sync' }
  | { type: 'unknown' };

type Callback = (event: ProjectEvent) => void;
const subscriptions = new Map<string, { unsub: () => void; callbacks: Set<Callback> }>();

function connectProject(projectId: string, callbacks: Set<Callback>) {
  const unsub = subscribeToChanges(projectId, (event) => {
    for (const fn of callbacks) fn(event as ProjectEvent);
  });
  return unsub;
}

export function subscribeProjectEvents(projectId: string, cb: Callback): () => void {
  let sub = subscriptions.get(projectId);
  if (!sub) {
    const callbacks = new Set<Callback>();
    const unsub = connectProject(projectId, callbacks);
    sub = { unsub, callbacks };
    subscriptions.set(projectId, sub);
  }
  sub.callbacks.add(cb);

  return () => {
    const s = subscriptions.get(projectId);
    if (!s) return;
    s.callbacks.delete(cb);
    if (s.callbacks.size === 0) {
      s.unsub();
      subscriptions.delete(projectId);
    }
  };
}

// Close SSE connections when page is hidden (improves iOS bfcache eligibility)
// Reopen when page becomes visible again
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Close all connections
      for (const [, sub] of subscriptions) {
        sub.unsub();
      }
    } else {
      // Reconnect all active subscriptions and catch up on missed events
      for (const [projectId, sub] of subscriptions) {
        sub.unsub = connectProject(projectId, sub.callbacks);
        for (const fn of sub.callbacks) fn({ type: 'full_sync' });
      }
    }
  });
}
