import { TaskCardActiveDetail } from './TaskCardActiveDetail';
import { TaskCardCompact } from './TaskCardCompact';
import { TaskCardFailedDetail } from './TaskCardFailedDetail';
import { TaskCardPreview } from './TaskCardPreview';
import { TaskDoneDetail } from './TaskDoneDetail';
import { TaskFlowStepDetail } from './TaskFlowStepDetail';
import { TaskIdleDetail } from './TaskIdleDetail';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { MentionMember, TaskCardMetaItem } from './task-card-types';
import { capTaskCardToken } from './task-card-status';
import s from './TaskCard.module.css';

export interface TaskCardProps {
  task: TaskView;
  job: JobView | null;
  canRunAi: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRework?: (jobId: string, note: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  onContinue?: (jobId: string) => void;
  onDragStart?: (e?: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  dragDisabled?: boolean;
  skipDragGhost?: boolean;
  showPriority?: boolean;
  isBacklog?: boolean;
  projectId?: string;
  hasUnreadMention?: boolean;
  commentCount?: number;
  brokenLink?: { up: boolean; down: boolean } | null;
  metaItems?: TaskCardMetaItem[];
  hideComments?: boolean;
  prevTaskId?: string | null;
  prevTask?: TaskView | null;
  prevJobStatus?: JobView['status'] | null;
  mentionMembers?: MentionMember[];
}

interface TaskCardViewProps extends TaskCardProps {
  viewMode?: 'task' | 'flow-step';
}

export function TaskCard({
  ...props
}: TaskCardProps) {
  return <TaskCardView {...props} viewMode="task" />;
}

export function TaskCardView({
  task,
  job,
  canRunAi,
  isExpanded,
  onToggleExpand,
  onRun,
  onEdit,
  onDelete,
  onUpdateTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onDragStart,
  onDragEnd,
  isDragging,
  dragDisabled,
  skipDragGhost,
  showPriority,
  isBacklog,
  projectId,
  hasUnreadMention,
  commentCount = 0,
  brokenLink,
  metaItems,
  hideComments,
  prevTaskId,
  prevTask,
  prevJobStatus,
  mentionMembers,
  viewMode = 'task',
}: TaskCardViewProps) {
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;
  const isFlowStep = viewMode === 'flow-step';

  const statusClass = jobStatus
    ? s[`status${capTaskCardToken(jobStatus)}`]
    : isHumanWaiting ? s.statusPaused
    : taskDone ? s.statusDone : '';

  // Priority visuals controlled by parent (backlog shows priority, workstreams don't)
  const hasStatusBorder = !!statusClass;
  const priorityVisible = showPriority && !hasStatusBorder;
  const priorityBgClass = showPriority && task.priority === 'critical' ? s.priorityCriticalBg
    : showPriority && task.priority === 'upcoming' ? s.priorityUpcomingBg
    : '';
  const priorityBorderClass = priorityVisible && task.priority === 'critical' ? s.priorityCriticalBorder
    : priorityVisible && task.priority === 'upcoming' ? s.priorityUpcomingBorder
    : '';

  return (
    <div
      data-task-card="true"
      className={`${s.card} ${priorityBgClass} ${priorityBorderClass} ${statusClass} ${isDragging ? s.dragging : ''}`}
      onClick={onToggleExpand}
    >
      <TaskCardCompact
        task={task}
        jobStatus={jobStatus}
        taskDone={taskDone}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        dragDisabled={dragDisabled}
        skipDragGhost={skipDragGhost}
        commentCount={commentCount}
        hasUnreadMention={hasUnreadMention}
        brokenLink={brokenLink}
      />

      {/* Active job detail — ALWAYS visible for running/paused/review */}
      {isActive && job && (
        <TaskCardActiveDetail
          task={task}
          job={job}
          projectId={projectId}
          onTerminate={onTerminate}
          onReply={onReply}
          onApprove={onApprove}
          onReject={onReject}
          onRework={onRework}
        />
      )}

      {/* Preview: description only (visible when collapsed and NOT active) */}
      {!isActive && (!isExpanded || taskDone) && <TaskCardPreview task={task} />}

      {/* Done section -- no border separator */}
      {!isActive && isExpanded && taskDone && (jobStatus === 'done' || !job) && (
        <TaskDoneDetail
          task={task}
          job={job}
          projectId={projectId}
          onUpdateTask={onUpdateTask}
          onRework={onRework}
          onMoveToBacklog={onMoveToBacklog}
          hideComments={hideComments}
          commentCount={commentCount}
          mentionMembers={mentionMembers}
        />
      )}

      {/* Expanded detail for non-active states (click to toggle) */}
      {!isActive && isExpanded && !taskDone && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {isFlowStep && (
            <TaskFlowStepDetail
              task={task}
              metaItems={metaItems}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}

          {/* FAILED */}
          {!isFlowStep && jobStatus === 'failed' && job && (
            <TaskCardFailedDetail
              task={task}
              job={job}
              canRunAi={canRunAi}
              onRun={onRun}
              onContinue={onContinue}
              onDeleteJob={onDeleteJob}
            />
          )}

          {/* IDLE — no active job, task in backlog/todo */}
          {!isFlowStep && !isActive && !taskDone && jobStatus !== 'failed' && (
            <TaskIdleDetail
              task={task}
              canRunAi={canRunAi}
              isBacklog={isBacklog}
              projectId={projectId}
              onRun={onRun}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdateTask={onUpdateTask}
              metaItems={metaItems}
              hideComments={hideComments}
              prevTaskId={prevTaskId}
              prevTask={prevTask}
              prevJobStatus={prevJobStatus}
              commentCount={commentCount}
              mentionMembers={mentionMembers}
            />
          )}
        </div>
      )}
    </div>
  );
}
