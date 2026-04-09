// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JobView } from '../components/job-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import { useWorkstreamColumnState } from './useWorkstreamColumnState';

const classes = {
  cardWrap: 'cardWrap',
  cardHighlight: 'cardHighlight',
  columnHighlight: 'columnHighlight',
};

describe('useWorkstreamColumnState', () => {
  it('keeps backlog tasks below a review chain draggable', () => {
    const tasks = [
      makeTask({ id: 'plan', title: 'Animate actions plan', status: 'review', chaining: 'produce', position: 0.5 }),
      makeTask({ id: 'animate', title: 'Animate actions', status: 'backlog', chaining: 'accept', position: 1.5 }),
      makeTask({ id: 'visuals', title: 'Change design of activated agendas from B&W', status: 'backlog', position: 2 }),
      makeTask({ id: 'connection', title: 'Make an elegant connection between centuries when they are different size', status: 'backlog', position: 3 }),
    ];
    const taskJobMap = {
      plan: makeJob({ taskId: 'plan', status: 'review' }),
    };

    const { result } = renderHook(() => useWorkstreamColumnState({
      workstream: makeWorkstream(),
      tasks,
      taskJobMap,
      isBacklog: false,
      focusTaskId: null,
      classes,
    }));

    expect(result.current.freezeIndex).toBe(0);
    expect(result.current.chainGroups).toEqual([{ taskIds: ['plan', 'animate'], startIndex: 0 }]);
    expect(result.current.dragDisabledGlobal).toBe(false);
  });
});

function makeTask(overrides: Partial<TaskView>): TaskView {
  return {
    id: 'task-1',
    title: 'Task',
    description: '',
    type: 'feature',
    mode: 'ai',
    effort: 'max',
    auto_continue: true,
    status: 'backlog',
    chaining: 'none',
    position: 1,
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobView>): JobView {
  return {
    id: 'job-1',
    taskId: 'task-1',
    title: 'Task',
    type: 'feature',
    status: 'queued',
    ...overrides,
  };
}

function makeWorkstream(): WorkstreamView {
  return {
    id: 'ws-1',
    name: 'Animations',
    status: 'active',
    position: 1,
  };
}
