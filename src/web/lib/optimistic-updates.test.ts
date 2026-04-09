import { describe, expect, it } from 'vitest';
import { applyPositionUpdates, applyTaskMove, buildRelativeMovePositionUpdates, replaceItemById } from './optimistic-updates';

describe('optimistic updates', () => {
  it('moves a column to the separator represented by the target side', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'Backlog' },
      { id: 'ws-2', position: 2, name: 'Build' },
      { id: 'ws-3', position: 3, name: 'Review' },
      { id: 'ws-4', position: 4, name: 'Ship' },
    ];

    const moved = applyPositionUpdates(
      workstreams,
      buildRelativeMovePositionUpdates(workstreams, 'ws-1', 'ws-3', 'left'),
      { sort: true },
    );

    expect(moved.map(workstream => workstream.id)).toEqual([
      'ws-2',
      'ws-1',
      'ws-3',
      'ws-4',
    ]);
  });

  it('treats right-of-left-column and left-of-right-column as the same separator', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'Backlog' },
      { id: 'ws-2', position: 2, name: 'Build' },
      { id: 'ws-3', position: 3, name: 'Review' },
      { id: 'ws-4', position: 4, name: 'Ship' },
    ];

    const moveAfterBuild = buildRelativeMovePositionUpdates(workstreams, 'ws-1', 'ws-2', 'right');
    const moveBeforeReview = buildRelativeMovePositionUpdates(workstreams, 'ws-1', 'ws-3', 'left');

    expect(moveAfterBuild).toEqual(moveBeforeReview);
    expect(moveAfterBuild).toEqual({ 'ws-1': 2.5 });
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
