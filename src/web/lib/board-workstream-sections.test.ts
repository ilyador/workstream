import { describe, expect, it } from 'vitest';
import {
  buildTaskSectionMap,
  getBoardWorkstreamSection,
  splitWorkstreamsByBoardSection,
} from './board-workstream-sections';
import type { TaskView, WorkstreamView } from './task-view';

function ws(overrides: Partial<WorkstreamView>): WorkstreamView {
  return {
    id: 'ws-1',
    name: 'Stream',
    status: 'active',
    position: 1,
    ...overrides,
  };
}

function task(overrides: Partial<TaskView>): TaskView {
  return {
    id: 'task-1',
    title: 'Task',
    description: '',
    type: 'feature',
    mode: 'ai',
    effort: 'max',
    auto_continue: true,
    status: 'done',
    position: 1,
    ...overrides,
  };
}

describe('board workstream sections', () => {
  it('keeps normal workstreams active', () => {
    expect(getBoardWorkstreamSection(ws({ status: 'active' }), [task({})], {})).toBe('active');
  });

  it('moves complete and merged streams to the complete section when all work is closed', () => {
    expect(getBoardWorkstreamSection(ws({ status: 'complete' }), [task({})], {})).toBe('complete');
    expect(getBoardWorkstreamSection(ws({ status: 'merged' }), [task({})], {})).toBe('complete');
  });

  it('moves a complete stream back to active when a task is rejected or reworked', () => {
    expect(getBoardWorkstreamSection(ws({ status: 'merged' }), [task({ status: 'todo' })], {})).toBe('active');
    expect(getBoardWorkstreamSection(ws({ status: 'complete' }), [task({ status: 'in_progress' })], {})).toBe('active');
  });

  it('moves a complete stream back to active while a task job is still open', () => {
    expect(
      getBoardWorkstreamSection(
        ws({ status: 'merged' }),
        [task({ id: 'task-1', status: 'done' })],
        { 'task-1': { status: 'review' } },
      ),
    ).toBe('active');
  });

  it('builds stable workstream and task section maps', () => {
    const workstreams = [ws({ id: 'active', status: 'active', position: 1 }), ws({ id: 'done', status: 'merged', position: 2 })];
    const tasksByWorkstream = {
      __backlog__: [task({ id: 'backlog-task' })],
      active: [task({ id: 'active-task', status: 'todo' })],
      done: [task({ id: 'done-task', status: 'done' })],
    };

    const split = splitWorkstreamsByBoardSection(workstreams, tasksByWorkstream, {});
    expect(split.activeWorkstreams.map(item => item.id)).toEqual(['active']);
    expect(split.completeWorkstreams.map(item => item.id)).toEqual(['done']);
    expect(buildTaskSectionMap(tasksByWorkstream, split.workstreamSectionById)).toEqual({
      'backlog-task': 'active',
      'active-task': 'active',
      'done-task': 'complete',
    });
  });
});
