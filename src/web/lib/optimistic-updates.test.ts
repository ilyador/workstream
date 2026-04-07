import { describe, expect, it } from 'vitest';
import { applyPositionUpdates, applyTaskMove, replaceItemById } from './optimistic-updates';

describe('optimistic updates', () => {
  it('swaps workstream positions and keeps the result sorted for column rollback paths', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'Backlog' },
      { id: 'ws-2', position: 2, name: 'Build' },
      { id: 'ws-3', position: 3, name: 'Review' },
    ];

    const swapped = applyPositionUpdates(workstreams, { 'ws-1': 3, 'ws-3': 1 }, { sort: true });

    expect(swapped.map(workstream => [workstream.id, workstream.position])).toEqual([
      ['ws-3', 1],
      ['ws-2', 2],
      ['ws-1', 3],
    ]);

    const rolledBack = applyPositionUpdates(swapped, { 'ws-1': 1, 'ws-3': 3 }, { sort: true });

    expect(rolledBack).toEqual(workstreams);
  });

  it('applies and rolls back a task move without mutating unrelated tasks', () => {
    const tasks = [
      { id: 'task-1', workstream_id: 'ws-1', position: 1, title: 'Draft' },
      { id: 'task-2', workstream_id: 'ws-1', position: 2, title: 'Review' },
    ];

    const moved = applyTaskMove(tasks, 'task-1', 'ws-2', 7.5);

    expect(moved).toEqual([
      { id: 'task-1', workstream_id: 'ws-2', position: 7.5, title: 'Draft' },
      { id: 'task-2', workstream_id: 'ws-1', position: 2, title: 'Review' },
    ]);

    const restored = replaceItemById(moved, tasks[0]);

    expect(restored).toEqual(tasks);
  });
});
