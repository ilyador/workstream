import type { JobView } from '../components/job-types';
import type { TaskView } from '../lib/task-view';

const UNTOUCHED_STATUSES = new Set(['backlog', 'todo']);

export interface ChainGroup {
  taskIds: string[];
  startIndex: number;
}

export function buildChainGroups(tasks: TaskView[]): ChainGroup[] {
  const groups: ChainGroup[] = [];
  let index = 0;

  while (index < tasks.length) {
    if (index > 0) {
      const previousTask = tasks[index - 1];
      const task = tasks[index];
      const previousProduces = previousTask.chaining === 'produce' || previousTask.chaining === 'both';
      const currentAccepts = task.chaining === 'accept' || task.chaining === 'both';

      if (previousProduces && currentAccepts) {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.taskIds.includes(previousTask.id)) {
          lastGroup.taskIds.push(task.id);
        } else {
          groups.push({ taskIds: [previousTask.id, task.id], startIndex: index - 1 });
        }
        index++;
        continue;
      }
    }

    index++;
  }

  return groups;
}

export function getFreezeIndex(tasks: TaskView[]) {
  let lastTouched = -1;

  for (let index = 0; index < tasks.length; index++) {
    if (!UNTOUCHED_STATUSES.has(tasks[index].status || 'backlog')) {
      lastTouched = index;
    }
  }

  return lastTouched;
}

export function buildBrokenLinks(tasks: TaskView[], isBacklog: boolean) {
  const map = new Map<string, { up: boolean; down: boolean }>();
  if (isBacklog) return map;

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index];
    const accepts = task.chaining === 'accept' || task.chaining === 'both';
    const produces = task.chaining === 'produce' || task.chaining === 'both';
    if (!accepts && !produces) continue;

    const previousTask = index > 0 ? tasks[index - 1] : null;
    const nextTask = index < tasks.length - 1 ? tasks[index + 1] : null;
    const up = accepts && !(previousTask && (previousTask.chaining === 'produce' || previousTask.chaining === 'both'));
    const down = produces && !(nextTask && (nextTask.chaining === 'accept' || nextTask.chaining === 'both'));

    if (up || down) {
      map.set(task.id, { up, down });
    }
  }

  return map;
}

export function getWorkstreamStatus({
  workstreamStatus,
  isBacklog,
  totalTasks,
  doneTasks,
  allDone,
  tasks,
  taskJobMap,
}: {
  workstreamStatus?: string | null;
  isBacklog: boolean;
  totalTasks: number;
  doneTasks: number;
  allDone: boolean;
  tasks: TaskView[];
  taskJobMap: Record<string, JobView>;
}) {
  if (isBacklog) return null;
  if (workstreamStatus === 'reviewing') return 'reviewing' as const;
  if (workstreamStatus === 'review_failed') return 'review failed' as const;
  if (workstreamStatus === 'complete') return 'done' as const;
  if (workstreamStatus === 'merged' || workstreamStatus === 'archived') return 'merged' as const;
  if (totalTasks === 0) return 'open' as const;

  const hasRunningTask = tasks.some(task => {
    const job = taskJobMap[task.id];
    if (job && ['queued', 'running', 'paused'].includes(job.status)) return true;
    if (task.mode === 'human' && task.status === 'in_progress') return true;
    return false;
  });
  if (hasRunningTask) return 'in progress' as const;

  const hasPendingApproval = tasks.some(task => taskJobMap[task.id]?.status === 'review');
  if (hasPendingApproval) return 'pending review' as const;

  const hasFailedTask = tasks.some(task => taskJobMap[task.id]?.status === 'failed');
  if (hasFailedTask) return 'failed' as const;
  if (allDone) return 'pending review' as const;
  if (doneTasks > 0) return 'in progress' as const;

  return 'open' as const;
}

export function getActiveTaskId(tasks: TaskView[], taskJobMap: Record<string, JobView>) {
  const activeAiTask = tasks.find(task => {
    const job = taskJobMap[task.id];
    return job && ['queued', 'running', 'paused', 'review'].includes(job.status);
  });
  if (activeAiTask) return activeAiTask.id;

  const activeHumanTask = tasks.find(task => (
    task.mode === 'human' &&
    task.status === 'in_progress' &&
    !taskJobMap[task.id]
  ));

  return activeHumanTask?.id ?? null;
}
