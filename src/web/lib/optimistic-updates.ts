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
