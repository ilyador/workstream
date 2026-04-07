import { broadcast, changeListenerEntries, deleteChangeListeners } from './realtime-listeners.js';

let pollingActive = false;
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startPollingFallback(): void {
  if (pollingActive) return;
  pollingActive = true;
  console.log('[realtime] Polling fallback active (every 3s)');
  pollingInterval = setInterval(() => {
    for (const [projectId, clients] of changeListenerEntries()) {
      if (clients.size === 0) {
        deleteChangeListeners(projectId);
        continue;
      }
      broadcast(projectId, { type: 'full_sync' });
    }
  }, 3000);
}

export function stopPollingFallback(): void {
  if (!pollingInterval) return;
  clearInterval(pollingInterval);
  pollingInterval = null;
  pollingActive = false;
  console.log('[realtime] Polling fallback stopped');
}
