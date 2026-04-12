import { describe, expect, it } from 'vitest';
import {
  buildBrokenLinks,
  buildChainGroups,
  getActiveTaskId,
  getFreezeIndex,
  getReorderBlockingTaskId,
  getWorkstreamStatus,
  hasAiTasks,
} from './workstream-column-derived';
import type { JobView } from '../components/job-types';
import type { TaskView } from '../lib/task-view';

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

function status({
  workstreamStatus,
  tasks,
  taskJobMap = {},
}: {
  workstreamStatus?: string | null;
  tasks: TaskView[];
  taskJobMap?: Record<string, JobView>;
}) {
  const doneTasks = tasks.filter(item => item.status === 'done').length;
  return getWorkstreamStatus({
    workstreamStatus,
    isBacklog: false,
    totalTasks: tasks.length,
    doneTasks,
    allDone: tasks.length > 0 && doneTasks === tasks.length,
    tasks,
    taskJobMap,
  });
}

describe('buildChainGroups', () => {
  it('returns no groups when no tasks have chaining', () => {
    const tasks = [task({ id: 'a', chaining: 'none' }), task({ id: 'b', chaining: 'none' })];
    expect(buildChainGroups(tasks)).toEqual([]);
  });

  it('groups adjacent produce→accept pairs', () => {
    const tasks = [
      task({ id: 'a', chaining: 'produce' }),
      task({ id: 'b', chaining: 'accept' }),
      task({ id: 'c', chaining: 'none' }),
    ];
    expect(buildChainGroups(tasks)).toEqual([{ taskIds: ['a', 'b'], startIndex: 0 }]);
  });

  it('extends a chain when the middle task is "both"', () => {
    const tasks = [
      task({ id: 'a', chaining: 'produce' }),
      task({ id: 'b', chaining: 'both' }),
      task({ id: 'c', chaining: 'accept' }),
    ];
    expect(buildChainGroups(tasks)).toEqual([{ taskIds: ['a', 'b', 'c'], startIndex: 0 }]);
  });

  it('creates separate groups for non-adjacent chains', () => {
    const tasks = [
      task({ id: 'a', chaining: 'produce' }),
      task({ id: 'b', chaining: 'accept' }),
      task({ id: 'c', chaining: 'none' }),
      task({ id: 'd', chaining: 'produce' }),
      task({ id: 'e', chaining: 'accept' }),
    ];
    const groups = buildChainGroups(tasks);
    expect(groups).toHaveLength(2);
    expect(groups[0].taskIds).toEqual(['a', 'b']);
    expect(groups[1].taskIds).toEqual(['d', 'e']);
  });

  it('returns empty for a single task', () => {
    expect(buildChainGroups([task({ id: 'a', chaining: 'produce' })])).toEqual([]);
  });
});

describe('getFreezeIndex', () => {
  it('returns -1 when all tasks are untouched', () => {
    expect(getFreezeIndex([task({ status: 'backlog' }), task({ status: 'todo' })])).toBe(-1);
  });

  it('returns the index of the last touched task', () => {
    const tasks = [task({ status: 'done' }), task({ status: 'in_progress' }), task({ status: 'todo' })];
    expect(getFreezeIndex(tasks)).toBe(1);
  });

  it('returns the last index when all tasks are touched', () => {
    const tasks = [task({ status: 'done' }), task({ status: 'review' })];
    expect(getFreezeIndex(tasks)).toBe(1);
  });

  it('returns -1 for empty array', () => {
    expect(getFreezeIndex([])).toBe(-1);
  });
});

describe('buildBrokenLinks', () => {
  it('returns empty map for backlog', () => {
    expect(buildBrokenLinks([task({ chaining: 'accept' })], true).size).toBe(0);
  });

  it('detects a broken "up" link when acceptor has no producer above', () => {
    const tasks = [task({ id: 'a', chaining: 'accept' })];
    const links = buildBrokenLinks(tasks, false);
    expect(links.get('a')).toEqual({ up: true, down: false });
  });

  it('detects a broken "down" link when producer has no acceptor below', () => {
    const tasks = [task({ id: 'a', chaining: 'produce' })];
    const links = buildBrokenLinks(tasks, false);
    expect(links.get('a')).toEqual({ up: false, down: true });
  });

  it('reports no breaks for a valid produce→accept pair', () => {
    const tasks = [
      task({ id: 'a', chaining: 'produce' }),
      task({ id: 'b', chaining: 'accept' }),
    ];
    expect(buildBrokenLinks(tasks, false).size).toBe(0);
  });

  it('reports both broken on a "both" task with no neighbors that chain', () => {
    const tasks = [
      task({ id: 'a', chaining: 'none' }),
      task({ id: 'b', chaining: 'both' }),
      task({ id: 'c', chaining: 'none' }),
    ];
    expect(buildBrokenLinks(tasks, false).get('b')).toEqual({ up: true, down: true });
  });
});

describe('getWorkstreamStatus', () => {
  it('keeps complete and merged status when all tasks are done', () => {
    expect(status({ workstreamStatus: 'complete', tasks: [task({ status: 'done' })] })).toBe('done');
    expect(status({ workstreamStatus: 'merged', tasks: [task({ status: 'done' })] })).toBe('merged');
  });

  it('returns null for the backlog column', () => {
    expect(getWorkstreamStatus({
      workstreamStatus: null, isBacklog: true, totalTasks: 1, doneTasks: 0, allDone: false,
      tasks: [task({ status: 'todo' })], taskJobMap: {},
    })).toBeNull();
  });

  it('returns reviewing / review failed / merged for lifecycle statuses', () => {
    const base = { isBacklog: false, totalTasks: 1, doneTasks: 0, allDone: false, tasks: [task({ status: 'todo' })], taskJobMap: {} };
    expect(getWorkstreamStatus({ ...base, workstreamStatus: 'reviewing' })).toBe('reviewing');
    expect(getWorkstreamStatus({ ...base, workstreamStatus: 'review_failed' })).toBe('review failed');
    expect(getWorkstreamStatus({ ...base, workstreamStatus: 'archived' })).toBe('merged');
  });

  it('returns open when there are no tasks', () => {
    expect(getWorkstreamStatus({
      workstreamStatus: 'active', isBacklog: false, totalTasks: 0, doneTasks: 0, allDone: false,
      tasks: [], taskJobMap: {},
    })).toBe('open');
  });

  it('returns pending review when a task job is in review', () => {
    expect(status({
      tasks: [task({ id: 'task-1', status: 'review' })],
      taskJobMap: { 'task-1': job('task-1', 'review') },
    })).toBe('pending review');
  });

  it('returns failed when a task job is failed', () => {
    expect(status({
      tasks: [task({ id: 'task-1', status: 'in_progress' })],
      taskJobMap: { 'task-1': job('task-1', 'failed') },
    })).toBe('failed');
  });

  it('returns pending review when all tasks are done but workstream is not yet complete', () => {
    expect(status({ workstreamStatus: 'active', tasks: [task({ status: 'done' })] })).toBe('pending review');
  });

  it('returns in progress when some tasks are done but not all', () => {
    expect(status({ tasks: [task({ status: 'done' }), task({ status: 'todo' })] })).toBe('in progress');
  });

  it('returns open when no tasks have been started', () => {
    expect(status({ tasks: [task({ status: 'backlog' })] })).toBe('open');
  });

  it('lets rejected or reworked tasks override complete lifecycle status', () => {
    expect(status({ workstreamStatus: 'merged', tasks: [task({ status: 'todo' })] })).toBe('open');
    expect(status({
      workstreamStatus: 'complete',
      tasks: [task({ id: 'task-1', status: 'in_progress' })],
      taskJobMap: { 'task-1': { id: 'job-1', taskId: 'task-1', title: 'Task', type: 'feature', status: 'queued' } as JobView },
    })).toBe('in progress');
  });
});

describe('task activity selectors', () => {
  it('detects whether a workstream contains any AI tasks', () => {
    expect(hasAiTasks([task({ id: 'human-1', mode: 'human' })])).toBe(false);
    expect(hasAiTasks([
      task({ id: 'human-1', mode: 'human' }),
      task({ id: 'ai-1', mode: 'ai' }),
    ])).toBe(true);
  });

  it('keeps review tasks active for UI without blocking reorder', () => {
    const tasks = [task({ id: 'task-1', status: 'review' })];
    const taskJobMap = { 'task-1': job('task-1', 'review') };

    expect(getActiveTaskId(tasks, taskJobMap)).toBe('task-1');
    expect(getReorderBlockingTaskId(tasks, taskJobMap)).toBeNull();
  });

  it('blocks reorder only for in-flight AI jobs', () => {
    for (const status of ['queued', 'running', 'paused'] as const) {
      const tasks = [task({ id: 'task-1', status: 'in_progress' })];
      const taskJobMap = { 'task-1': job('task-1', status) };

      expect(getReorderBlockingTaskId(tasks, taskJobMap)).toBe('task-1');
    }
  });

  it('does not block reorder for human tasks waiting in progress', () => {
    const tasks = [task({ id: 'task-1', mode: 'human', status: 'in_progress' })];

    expect(getActiveTaskId(tasks, {})).toBe('task-1');
    expect(getReorderBlockingTaskId(tasks, {})).toBeNull();
  });
});

function job(taskId: string, status: JobView['status']): JobView {
  return {
    id: `job-${taskId}`,
    taskId,
    title: 'Task',
    type: 'feature',
    status,
  } as JobView;
}
