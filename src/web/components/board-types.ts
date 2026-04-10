import type { JobView } from './job-types';
import type { TaskRecord } from '../lib/api';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import type { RelativeDropSide } from '../lib/optimistic-updates';

export interface BoardProps {
  workstreams: WorkstreamView[];
  tasks: TaskRecord[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  userRole: string;
  projectId: string | null;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  focusWsId?: string | null;
  onCreateWorkstream: (name: string, description?: string, has_code?: boolean) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string, side: RelativeDropSide, orderedIds: string[]) => void;
  onAddTask: (workstreamId: string | null) => void;
  onRunTask: (taskId: string) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onEditTask: (task: TaskView) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => void;
  onTerminate: (jobId: string) => void;
  onReply: (jobId: string, answer: string) => void;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onRework: (jobId: string, note: string) => void;
  onDeleteJob: (jobId: string) => void;
  onMoveToBacklog: (jobId: string) => void;
  onContinue: (jobId: string) => void;
  onCreatePr: (workstreamId: string, options?: { review?: boolean }) => void;
  currentUserId?: string;
}

export interface BoardColumnDragProps {
  draggedTaskId: string | null;
  draggedGroupIds: string[];
  onDragTaskStart: (taskId: string) => void;
  onDragGroupStart: (taskIds: string[]) => void;
  onDragTaskEnd: () => void;
  onDropTask: (workstreamId: string | null, dropBeforeTaskId: string | null) => void;
}

export interface BoardColumnDataProps {
  taskJobMap: Record<string, JobView>;
  canRunAi: boolean;
  projectId: string | null;
  members: Array<{ id: string; name: string; initials: string }>;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
}

export type BoardTaskActionProps = Pick<
  BoardProps,
  | 'onRunTask'
  | 'onEditTask'
  | 'onDeleteTask'
  | 'onUpdateTask'
  | 'onTerminate'
  | 'onReply'
  | 'onApprove'
  | 'onReject'
  | 'onRework'
  | 'onDeleteJob'
  | 'onMoveToBacklog'
  | 'onContinue'
  | 'currentUserId'
>;
