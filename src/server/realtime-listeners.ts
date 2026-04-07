export type ChangeSender = (data: unknown) => void;

const changeListeners = new Map<string, Set<ChangeSender>>();

export function broadcast(projectId: string, event: { type: string; [key: string]: unknown }): void {
  const clients = changeListeners.get(projectId);
  if (!clients || clients.size === 0) return;
  for (const send of clients) {
    try {
      send(event);
    } catch {
      removeChangeListener(projectId, send);
    }
  }
}

export function addChangeListener(projectId: string, send: ChangeSender): () => void {
  if (!changeListeners.has(projectId)) changeListeners.set(projectId, new Set());
  changeListeners.get(projectId)?.add(send);
  return () => removeChangeListener(projectId, send);
}

function removeChangeListener(projectId: string, send: ChangeSender): void {
  const clients = changeListeners.get(projectId);
  if (!clients) return;
  clients.delete(send);
  if (clients.size === 0) changeListeners.delete(projectId);
}

export function changeListenerEntries(): IterableIterator<[string, Set<ChangeSender>]> {
  return changeListeners.entries();
}

export function deleteChangeListeners(projectId: string): void {
  changeListeners.delete(projectId);
}
