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

  it('returns an empty update when the dragged id is not in the list', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
    ];
    expect(buildRelativeMovePositionUpdates(workstreams, 'missing', 'ws-1', 'left')).toEqual({});
  });

  it('returns an empty update when the target id is not in the list', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
    ];
    expect(buildRelativeMovePositionUpdates(workstreams, 'ws-1', 'missing', 'right')).toEqual({});
  });

  it('returns an empty update when dropping an item onto its own current separator', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
      { id: 'ws-3', position: 3, name: 'C' },
    ];
    expect(buildRelativeMovePositionUpdates(workstreams, 'ws-2', 'ws-1', 'right')).toEqual({});
    expect(buildRelativeMovePositionUpdates(workstreams, 'ws-2', 'ws-3', 'left')).toEqual({});
  });

  it('halves the next position when dropped at the start of the list', () => {
    const workstreams = [
      { id: 'ws-1', position: 10, name: 'A' },
      { id: 'ws-2', position: 20, name: 'B' },
    ];
    expect(buildRelativeMovePositionUpdates(workstreams, 'ws-2', 'ws-1', 'left')).toEqual({ 'ws-2': 5 });
  });

  it('adds one to the previous position when dropped at the end of the list', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
      { id: 'ws-3', position: 3, name: 'C' },
    ];
    expect(buildRelativeMovePositionUpdates(workstreams, 'ws-1', 'ws-3', 'right')).toEqual({ 'ws-1': 4 });
  });

  it('falls back to full reordering when adjacent gap is smaller than EPSILON', () => {
    const a = 1;
    const b = 1 + Number.EPSILON / 2;
    const workstreams = [
      { id: 'ws-1', position: a, name: 'A' },
      { id: 'ws-2', position: b, name: 'B' },
      { id: 'ws-3', position: 5, name: 'C' },
    ];
    const updates = buildRelativeMovePositionUpdates(workstreams, 'ws-3', 'ws-1', 'right');
    expect(updates).toEqual({ 'ws-1': 1, 'ws-3': 2, 'ws-2': 3 });
  });

  it('applyPositionUpdates preserves input order when sort is not requested', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
      { id: 'ws-3', position: 3, name: 'C' },
    ];
    const updated = applyPositionUpdates(workstreams, { 'ws-1': 99 });
    expect(updated.map(w => w.id)).toEqual(['ws-1', 'ws-2', 'ws-3']);
    expect(updated[0].position).toBe(99);
  });

  it('applyPositionUpdates preserves references for items without updates', () => {
    const workstreams = [
      { id: 'ws-1', position: 1, name: 'A' },
      { id: 'ws-2', position: 2, name: 'B' },
    ];
    const updated = applyPositionUpdates(workstreams, { 'ws-1': 99 });
    expect(updated[1]).toBe(workstreams[1]);
    expect(updated[0]).not.toBe(workstreams[0]);
  });

  it('applyTaskMove is a no-op when the task id is not found', () => {
    const tasks = [
      { id: 'task-1', workstream_id: 'ws-1', position: 1, title: 'A' },
    ];
    const updated = applyTaskMove(tasks, 'missing', 'ws-2', 5);
    expect(updated).toEqual(tasks);
    expect(updated[0]).toBe(tasks[0]);
  });

  it('replaceItemById is a no-op when the replacement id is not found', () => {
    const tasks = [
      { id: 'task-1', workstream_id: 'ws-1', position: 1, title: 'A' },
    ];
    const replacement = { id: 'missing', workstream_id: 'ws-2', position: 9, title: 'X' };
    const updated = replaceItemById(tasks, replacement);
    expect(updated).toEqual(tasks);
    expect(updated[0]).toBe(tasks[0]);
  });
});
