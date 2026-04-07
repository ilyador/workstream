import type { NotificationRecord, TaskRecord, WorkstreamRecord } from './api';
import type { JobView } from '../components/job-types';

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
  notifications: NotificationRecord[] = [],
): ProjectReviewItem[] {
  const items: ProjectReviewItem[] = [];
  const addedWorkstreamIds = new Set<string>();

  const addWorkstreamReviewItem = (workstream: WorkstreamRecord) => {
    if (workstream.status === 'archived') return;
    if (addedWorkstreamIds.has(workstream.id)) return;
    addedWorkstreamIds.add(workstream.id);
    items.push({
      id: `ws-${workstream.id}`,
      label: workstream.name,
      sublabel: 'Workstream review',
      workstreamId: workstream.id,
    });
  };

  if (currentUserId) {
    for (const workstream of workstreams) {
      if (workstream.reviewer_id === currentUserId) {
        addWorkstreamReviewItem(workstream);
      }
    }

    for (const notification of notifications) {
      if (notification.type !== 'review_request' || !notification.workstream_id) continue;
      const workstream = workstreams.find(w => w.id === notification.workstream_id);
      if (!workstream) continue;
      if (workstream.reviewer_id && workstream.reviewer_id !== currentUserId) continue;
      addWorkstreamReviewItem(workstream);
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
