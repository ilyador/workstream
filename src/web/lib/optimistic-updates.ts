export type RelativeDropSide = 'left' | 'right';

export function applyPositionUpdates<T extends { id: string; position: number }>(
  items: T[],
  updates: Record<string, number>,
  options: { sort?: boolean } = {},
): T[] {
  const next = items.map(item => (
    Object.prototype.hasOwnProperty.call(updates, item.id)
      ? { ...item, position: updates[item.id] }
      : item
  ));

  return options.sort ? next.sort((a, b) => a.position - b.position) : next;
}

export function buildRelativeMovePositionUpdates<T extends { id: string; position: number }>(
  items: T[],
  draggedId: string,
  targetId: string,
  side: RelativeDropSide,
): Record<string, number> {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const fromIndex = sorted.findIndex(item => item.id === draggedId);
  if (fromIndex < 0) return {};

  const draggedItem = sorted[fromIndex];
  const remaining = sorted.filter(item => item.id !== draggedId);
  const targetIndex = remaining.findIndex(item => item.id === targetId);
  if (targetIndex < 0) return {};

  const insertIndex = side === 'left' ? targetIndex : targetIndex + 1;
  if (insertIndex === fromIndex) return {};

  const previousItem = insertIndex > 0 ? remaining[insertIndex - 1] : null;
  const nextItem = insertIndex < remaining.length ? remaining[insertIndex] : null;

  if (!previousItem && nextItem && nextItem.position > 0) {
    return { [draggedId]: nextItem.position / 2 };
  }

  if (previousItem && !nextItem) {
    return { [draggedId]: previousItem.position + 1 };
  }

  if (previousItem && nextItem) {
    const gap = nextItem.position - previousItem.position;
    if (gap > Number.EPSILON) {
      return { [draggedId]: previousItem.position + gap / 2 };
    }
  }

  const reordered = [...remaining];
  reordered.splice(insertIndex, 0, draggedItem);
  return Object.fromEntries(reordered.map((item, index) => [item.id, index + 1]));
}

export function applyTaskMove<T extends { id: string; workstream_id: string | null; position: number }>(
  tasks: T[],
  taskId: string,
  workstreamId: string | null,
  newPosition: number,
): T[] {
  return tasks.map(task => (
    task.id === taskId
      ? { ...task, workstream_id: workstreamId, position: newPosition }
      : task
  ));
}

export function replaceItemById<T extends { id: string }>(items: T[], replacement: T): T[] {
  return items.map(item => (item.id === replacement.id ? replacement : item));
}
