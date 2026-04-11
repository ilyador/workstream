import { describe, expect, it } from 'vitest';
import { getActiveTaskId, getReorderBlockingTaskId, getWorkstreamStatus, hasAiTasks } from './workstream-column-derived';
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

describe('getWorkstreamStatus', () => {
  it('keeps complete and merged status when all tasks are done', () => {
    expect(status({ workstreamStatus: 'complete', tasks: [task({ status: 'done' })] })).toBe('done');
    expect(status({ workstreamStatus: 'merged', tasks: [task({ status: 'done' })] })).toBe('merged');
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
