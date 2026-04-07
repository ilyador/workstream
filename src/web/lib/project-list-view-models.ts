import type { TaskRecord, WorkstreamRecord } from './api';
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
