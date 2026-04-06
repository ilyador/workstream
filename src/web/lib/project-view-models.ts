import { timeAgo } from './time';
import { pickPrimaryJobs } from './job-selection';
import type { Flow, MemberRecord, NotificationRecord, TaskRecord, WorkstreamRecord } from './api';
import type { CompletedPhaseRecord, FlowSnapshotRecord, JobRecord, JobView } from '../components/job-types';

const TASK_TYPE_PHASES: Record<string, string[]> = {
  'bug-fix': ['plan', 'analyze', 'fix', 'verify', 'review'],
  feature: ['plan', 'implement', 'verify', 'review'],
  refactor: ['plan', 'analyze', 'refactor', 'verify', 'review'],
  test: ['plan', 'write-tests', 'verify', 'review'],
  'ui-fix': ['plan', 'implement', 'verify', 'review'],
  design: ['plan', 'implement', 'verify', 'review'],
  chore: ['plan', 'implement', 'verify', 'review'],
};

export interface ProjectTodoItem {
  id: string;
  label: string;
  sublabel?: string;
  tag?: string;
  taskId?: string;
}

export interface ProjectReviewItem extends ProjectTodoItem {
  workstreamId?: string;
}

function cleanSummary(raw: string): string {
  return raw
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\[/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function buildPhases(
  phasesCompleted: Array<string | CompletedPhaseRecord>,
  currentPhase: string | null,
  taskType: string,
  flowSnapshot?: FlowSnapshotRecord | null,
): { name: string; status: string; summary?: string }[] {
  const completedMap = new Map<string, string>();

  for (const phase of phasesCompleted) {
    const name = typeof phase === 'string' ? phase : phase.name || phase.phase || '';
    if (!name) continue;
    const summary = typeof phase === 'string' ? '' : phase.summary || '';
    completedMap.set(name, summary);
  }

  const allPhases = flowSnapshot?.steps?.map(step => step.name)
    || TASK_TYPE_PHASES[taskType]
    || TASK_TYPE_PHASES.feature;

  return allPhases.map(name => {
    if (completedMap.has(name)) {
      return {
        name,
        status: 'completed',
        summary: completedMap.get(name) || undefined,
      };
    }
    if (name === currentPhase) return { name, status: 'current' };
    return { name, status: 'pending' };
  });
}

export function buildMentionedTaskIds(notifications: NotificationRecord[]) {
  const ids = new Set<string>();

  for (const notification of notifications) {
    if (!notification.read && notification.type === 'mention' && notification.task_id) {
      ids.add(notification.task_id);
    }
  }

  return ids;
}

export function buildTaskTitleMap(tasks: TaskRecord[]) {
  const map: Record<string, string> = {};
  for (const task of tasks) map[task.id] = task.title;
  return map;
}

export function buildTaskTypeMap(tasks: TaskRecord[]) {
  const map: Record<string, string> = {};
  for (const task of tasks) map[task.id] = task.type;
  return map;
}

export function buildMemberMap(members: MemberRecord[]) {
  const map: Record<string, { name: string; initials: string }> = {};
  for (const member of members) map[member.id] = { name: member.name, initials: member.initials };
  return map;
}

export function buildFlowMap(flows: Flow[]) {
  const map: Record<string, string> = {};
  for (const flow of flows) map[flow.id] = flow.name;
  return map;
}

export function buildTypeFlowMap(flows: Flow[]) {
  const map: Record<string, string> = {};
  for (const flow of flows) {
    for (const type of flow.default_types || []) {
      if (!map[type]) map[type] = flow.id;
    }
  }
  return map;
}

export function buildJobViews(
  jobs: JobRecord[],
  taskTitleMap: Record<string, string>,
  taskTypeMap: Record<string, string>,
) {
  const order: Record<string, number> = { running: 0, queued: 1, paused: 2, review: 3, done: 4, failed: 5 };
  const sorted = [...jobs].sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

  return sorted.map(job => ({
    id: job.id,
    taskId: job.task_id,
    title: taskTitleMap[job.task_id] || 'Task',
    type: 'task',
    status: job.status as JobView['status'],
    currentPhase: job.current_phase || undefined,
    attempt: job.attempt,
    maxAttempts: job.max_attempts,
    startedAt: job.started_at || undefined,
    phases: buildPhases(
      job.phases_completed || [],
      job.current_phase,
      taskTypeMap[job.task_id] || 'feature',
      job.flow_snapshot,
    ),
    question: job.question || undefined,
    review: job.review_result ? {
      filesChanged: job.review_result.files_changed ?? job.review_result.filesChanged ?? 0,
      testsPassed: job.review_result.tests_passed ?? job.review_result.testsPassed,
      linesAdded: job.review_result.lines_added ?? job.review_result.linesAdded ?? 0,
      linesRemoved: job.review_result.lines_removed ?? job.review_result.linesRemoved ?? 0,
      summary: cleanSummary(job.review_result.summary ?? ''),
      changedFiles: job.review_result.changed_files ?? job.review_result.changedFiles ?? undefined,
    } : undefined,
    completedAgo: job.completed_at ? timeAgo(job.completed_at) : undefined,
    completedAt: job.completed_at || undefined,
  }));
}

export function buildTodoItems(
  tasks: TaskRecord[],
  wsNameMap: Record<string, string>,
  currentUserId?: string | null,
): ProjectTodoItem[] {
  if (!currentUserId) return [];

  return tasks
    .filter(task => task.assignee === currentUserId && task.status !== 'done' && task.workstream_id)
    .map(task => ({
      id: task.id,
      label: task.title,
      sublabel: task.workstream_id ? wsNameMap[task.workstream_id] : undefined,
      tag: task.type,
      taskId: task.id,
    }));
}

export function buildReviewItems(
  workstreams: WorkstreamRecord[],
  primaryJobViews: JobView[],
  tasks: TaskRecord[],
  wsNameMap: Record<string, string>,
  currentUserId?: string | null,
): ProjectReviewItem[] {
  const items: ProjectReviewItem[] = [];

  if (currentUserId) {
    for (const workstream of workstreams) {
      if (workstream.reviewer_id === currentUserId && workstream.status !== 'merged' && workstream.status !== 'archived') {
        items.push({
          id: `ws-${workstream.id}`,
          label: workstream.name,
          sublabel: 'Workstream review',
          workstreamId: workstream.id,
        });
      }
    }
  }

  for (const job of primaryJobViews) {
    if (job.status !== 'review') continue;
    const task = tasks.find(t => t.id === job.taskId);
    items.push({
      id: job.id,
      label: job.title,
      sublabel: task?.workstream_id ? wsNameMap[task.workstream_id] : undefined,
      tag: task?.type,
      taskId: job.taskId,
    });
  }

  for (const job of primaryJobViews) {
    if (job.status !== 'paused' || !job.question) continue;
    const task = tasks.find(t => t.id === job.taskId);
    items.push({
      id: job.id,
      label: job.title,
      sublabel: 'Question asked',
      tag: task?.type,
      taskId: job.taskId,
    });
  }

  return items;
}

export function buildWorkspaceProgress(
  activeWorkstreams: WorkstreamRecord[],
  tasks: TaskRecord[],
) {
  const activeWorkstream = activeWorkstreams[0];
  const wsTasks = activeWorkstream
    ? tasks.filter(task => task.workstream_id === activeWorkstream.id)
    : tasks;

  return {
    name: activeWorkstream?.name || 'All',
    tasksDone: wsTasks.filter(task => task.status === 'done').length,
    tasksTotal: wsTasks.length,
  };
}

export function buildPrimaryJobViews(jobViews: JobView[]) {
  return pickPrimaryJobs(jobViews);
}

export function buildWorkstreamNameMap(workstreams: WorkstreamRecord[]) {
  const map: Record<string, string> = {};
  for (const workstream of workstreams) map[workstream.id] = workstream.name;
  return map;
}
