import type { TaskView, WorkstreamView } from './task-view';

export type BoardWorkstreamSection = 'active' | 'complete';

const COMPLETE_WORKSTREAM_STATUSES = new Set(['complete', 'merged']);
const CLOSED_TASK_STATUSES = new Set(['done', 'canceled']);
const CLOSED_JOB_STATUSES = new Set(['done', 'canceled']);

type TaskJobStatusMap = Record<string, { status?: string | null } | null | undefined>;

function hasOpenWork(tasks: TaskView[], taskJobMap: TaskJobStatusMap) {
  return tasks.some(task => {
    if (!CLOSED_TASK_STATUSES.has(task.status || 'backlog')) return true;
    const jobStatus = taskJobMap[task.id]?.status;
    return !!jobStatus && !CLOSED_JOB_STATUSES.has(jobStatus);
  });
}

export function getBoardWorkstreamSection(
  workstream: WorkstreamView,
  tasks: TaskView[],
  taskJobMap: TaskJobStatusMap,
): BoardWorkstreamSection {
  if (!COMPLETE_WORKSTREAM_STATUSES.has(workstream.status)) return 'active';
  return hasOpenWork(tasks, taskJobMap) ? 'active' : 'complete';
}

export function splitWorkstreamsByBoardSection(
  workstreams: WorkstreamView[],
  tasksByWorkstream: Record<string, TaskView[]>,
  taskJobMap: TaskJobStatusMap,
) {
  const activeWorkstreams: WorkstreamView[] = [];
  const completeWorkstreams: WorkstreamView[] = [];
  const workstreamSectionById: Record<string, BoardWorkstreamSection> = {};

  for (const workstream of workstreams) {
    const section = getBoardWorkstreamSection(
      workstream,
      tasksByWorkstream[workstream.id] || [],
      taskJobMap,
    );

    workstreamSectionById[workstream.id] = section;
    if (section === 'complete') completeWorkstreams.push(workstream);
    else activeWorkstreams.push(workstream);
  }

  return { activeWorkstreams, completeWorkstreams, workstreamSectionById };
}

export function buildTaskSectionMap(
  tasksByWorkstream: Record<string, TaskView[]>,
  workstreamSectionById: Record<string, BoardWorkstreamSection>,
) {
  const taskSectionById: Record<string, BoardWorkstreamSection> = {};

  for (const task of tasksByWorkstream.__backlog__ || []) {
    taskSectionById[task.id] = 'active';
  }

  for (const [workstreamId, tasks] of Object.entries(tasksByWorkstream)) {
    if (workstreamId === '__backlog__') continue;
    const section = workstreamSectionById[workstreamId] || 'active';
    for (const task of tasks) taskSectionById[task.id] = section;
  }

  return taskSectionById;
}
