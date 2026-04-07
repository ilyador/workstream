import type { TaskRecord } from './api';

export type TaskAssignee = {
  type: 'user' | 'ai';
  name?: string;
  initials?: string;
};

export type TaskChaining = 'none' | 'produce' | 'accept' | 'both';

export interface TaskView {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  auto_continue: boolean;
  assignee?: TaskAssignee | null;
  images?: string[];
  status?: string;
  priority?: string;
  chaining?: TaskChaining;
  workstream_id?: string | null;
  position?: number;
  flow_id?: string | null;
}

export interface WorkstreamView {
  id: string;
  name: string;
  description?: string;
  has_code?: boolean;
  status: string;
  position: number;
  pr_url?: string | null;
  reviewer_id?: string | null;
  review_output?: string | null;
}

export function normalizeTaskChaining(value?: string | null): TaskChaining | undefined {
  return value === 'none' || value === 'produce' || value === 'accept' || value === 'both'
    ? value
    : undefined;
}

export function compareByPosition(
  a: { position?: number | null },
  b: { position?: number | null },
): number {
  return (a.position ?? 0) - (b.position ?? 0);
}

export function toTaskView(
  task: TaskRecord,
  memberMap: Record<string, { name: string; initials: string }>,
  flowName?: string | null,
): TaskView {
  const member = task.assignee ? memberMap[task.assignee] : null;
  return {
    ...task,
    assignee: member
      ? { type: 'user', name: member.name, initials: member.initials }
      : flowName
        ? { type: 'ai', name: flowName }
        : task.assignee
          ? { type: 'ai' }
          : null,
    workstream_id: task.workstream_id ?? null,
    position: task.position ?? 0,
    chaining: normalizeTaskChaining(task.chaining),
  };
}
