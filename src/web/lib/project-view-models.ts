import type { Flow, MemberRecord, NotificationRecord, TaskRecord, WorkstreamRecord } from './api';

export {
  buildJobViews,
  buildPrimaryJobViews,
} from './project-job-view-models';
export {
  buildReviewItems,
  buildTodoItems,
} from './project-list-view-models';
export type {
  ProjectReviewItem,
  ProjectTodoItem,
} from './project-list-view-models';

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

export function buildWorkstreamNameMap(workstreams: WorkstreamRecord[]) {
  const map: Record<string, string> = {};
  for (const workstream of workstreams) map[workstream.id] = workstream.name;
  return map;
}
