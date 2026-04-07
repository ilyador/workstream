import { describe, expect, it } from 'vitest';
import { getWorkstreamStatus } from './workstream-column-derived';
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
