import { useEffect, useState } from 'react';
import { TaskCardActiveDetail } from './TaskCardActiveDetail';
import { TaskCardCompact } from './TaskCardCompact';
import { TaskCardFailedDetail } from './TaskCardFailedDetail';
import { TaskCardPreview } from './TaskCardPreview';
import { TaskDoneDetail } from './TaskDoneDetail';
import { TaskFlowStepDetail } from './TaskFlowStepDetail';
import { TaskIdleDetail } from './TaskIdleDetail';
import type { JobView } from './job-types';
import { useArtifacts, type ArtifactsData } from '../hooks/useArtifacts';
import type { TaskFileDependency } from '../lib/file-passing';
import type { TaskView } from '../lib/task-view';
import type { MentionMember, TaskCardMetaItem } from './task-card-types';
import { capTaskCardToken } from './task-card-status';
import s from './TaskCard.module.css';

const COLLAPSE_ANIMATION_MS = 160;

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
  actionBusy?: boolean;
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
  fileDependency?: TaskFileDependency | null;
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
  fileDependency,
  mentionMembers,
  actionBusy,
  viewMode = 'task',
}: TaskCardViewProps) {
  const [isCollapsing, setIsCollapsing] = useState(false);
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const isReview = jobStatus === 'review';
  const renderExpandedDetail = isExpanded || isCollapsing;
  const collapseActive = isCollapsing && !isExpanded;
  const showActiveDetail = isActive && (!isReview || renderExpandedDetail);
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;
  const isFlowStep = viewMode === 'flow-step';

  useEffect(() => {
    if (!isCollapsing) return;
    const timer = setTimeout(() => {
      setIsCollapsing(false);
    }, COLLAPSE_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [isCollapsing]);

  const handleToggleExpand = () => {
    setIsCollapsing(isExpanded);
    onToggleExpand();
  };

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

  const renderCard = (reviewArtifactsData?: ArtifactsData) => (
    <div
      data-task-card="true"
      className={`${s.card} ${priorityBgClass} ${priorityBorderClass} ${statusClass} ${isDragging ? s.dragging : ''}`}
      onClick={handleToggleExpand}
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

      {/* Active job detail: running/paused always visible; review follows expansion state */}
      {showActiveDetail && job && (
        <TaskCardActiveDetail
          task={task}
          job={job}
          projectId={projectId}
          busy={actionBusy}
          onTerminate={onTerminate}
          onReply={onReply}
          onApprove={onApprove}
          onReject={onReject}
          onRework={onRework}
          reviewArtifactsData={reviewArtifactsData}
          collapsing={isReview && collapseActive}
        />
      )}

      {/* Preview: description only (visible when collapsed and NOT active) */}
      {((!isActive && (!renderExpandedDetail || taskDone)) || (isReview && !renderExpandedDetail)) && (
        <div className={s.previewReveal}>
          <TaskCardPreview
            task={task}
            filePreviewArtifactsData={isReview ? reviewArtifactsData : undefined}
          />
        </div>
      )}

      {/* Done section -- no border separator */}
      {!isActive && renderExpandedDetail && taskDone && (jobStatus === 'done' || !job) && (
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
          collapsing={collapseActive}
        />
      )}

      {/* Expanded detail for non-active states (click to toggle) */}
      {!isActive && renderExpandedDetail && !taskDone && (
        <div className={`${s.detail} ${collapseActive ? s.detailClosing : ''}`} onClick={(e) => e.stopPropagation()}>
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
              jobStatus={jobStatus}
              fileDependency={fileDependency}
              commentCount={commentCount}
              mentionMembers={mentionMembers}
            />
          )}
        </div>
      )}
    </div>
  );

  if (isReview && !isFlowStep) {
    return (
      <TaskCardReviewArtifactScope taskId={task.id} projectId={projectId}>
        {renderCard}
      </TaskCardReviewArtifactScope>
    );
  }

  return renderCard();
}

function TaskCardReviewArtifactScope({
  taskId,
  projectId,
  children,
}: {
  taskId: string;
  projectId?: string;
  children: (artifactsData: ArtifactsData) => React.ReactNode;
}) {
  const artifactsData = useArtifacts(taskId, projectId);
  return <>{children(artifactsData)}</>;
}
