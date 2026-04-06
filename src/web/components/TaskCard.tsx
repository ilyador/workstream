import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TaskCardActiveDetail, TaskCardFailedDetail } from './TaskCardStateDetails';
import { TaskDoneDetail } from './TaskDoneDetail';
import { TaskFlowStepDetail } from './TaskFlowStepDetail';
import { TaskIdleDetail } from './TaskIdleDetail';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { MentionMember, TaskCardMetaItem } from './task-card-types';
import s from './TaskCard.module.css';

function cap(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }

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
  mentionMembers?: MentionMember[];
}

interface TaskCardViewProps extends TaskCardProps {
  viewMode?: 'task' | 'flow-step';
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  paused: 'Waiting',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
};

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
  mentionMembers,
  viewMode = 'task',
}: TaskCardViewProps) {
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;
  const isFlowStep = viewMode === 'flow-step';

  const statusClass = jobStatus
    ? s[`status${cap(jobStatus)}`]
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

  const dotClass = jobStatus
    ? s[`dot${cap(jobStatus)}`]
    : taskDone ? s.dotDone : s.dotIdle;

  const tagStatusClass = jobStatus
    ? s[`tag${cap(jobStatus)}`] : '';

  return (
    <div
      data-task-card="true"
      className={`${s.card} ${priorityBgClass} ${priorityBorderClass} ${statusClass} ${isDragging ? s.dragging : ''}`}
      onClick={onToggleExpand}
    >
      {/* Compact view — always visible */}
      <div className={s.compact}>
        {!dragDisabled && (
          <span
            className={s.handle}
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              if (!skipDragGhost) {
                const card = (e.target as HTMLElement).closest(`.${s.card}`) as HTMLElement;
                if (card) {
                  const clone = card.cloneNode(true) as HTMLElement;
                  clone.style.width = `${card.offsetWidth}px`;
                  clone.style.transform = 'rotate(2deg) scale(1.02)';
                  clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)';
                  clone.style.borderRadius = '10px';
                  clone.style.opacity = '0.92';
                  clone.style.position = 'fixed';
                  clone.style.top = '-9999px';
                  clone.style.left = '-9999px';
                  clone.style.pointerEvents = 'none';
                  clone.id = '__drag-preview__';
                  document.body.appendChild(clone);
                  e.dataTransfer.setDragImage(clone, card.offsetWidth / 2, 20);
                }
              }
              onDragStart?.(e);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              document.getElementById('__drag-preview__')?.remove();
              onDragEnd?.();
            }}
            onClick={(e) => e.stopPropagation()}
            title="Drag to reorder"
          >&#8942;&#8942;</span>
        )}

        {(jobStatus || taskDone) && <span className={`${s.statusDot} ${dotClass}`} />}

        <span className={s.title}>{task.title}</span>

        <div className={s.tags}>
          {brokenLink && (
            <span className={s.brokenLink} title={
              brokenLink.up && brokenLink.down ? 'Missing input and output connection'
              : brokenLink.up ? 'No previous task produces files'
              : 'No next task accepts files'
            }>
              {brokenLink.up && '\u2191'}{'\u26A0'}{brokenLink.down && '\u2193'}
            </span>
          )}
          {!task.auto_continue && (!task.assignee || task.assignee.type === 'ai') && (
            <span className={s.chain} title="Manual review required">&#9646;&#9646;</span>
          )}
          {jobStatus && jobStatus !== 'done' && (
            <span className={`${s.tag} ${s.tagStatus} ${tagStatusClass}`}>
              {STATUS_LABELS[jobStatus]}
            </span>
          )}
          {commentCount > 0 && (
            <span className={`${s.commentBadge} ${hasUnreadMention ? s.commentBadgeMention : ''}`} title={hasUnreadMention ? 'You were mentioned' : `${commentCount} comment${commentCount > 1 ? 's' : ''}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
              {commentCount}
            </span>
          )}
          {task.assignee && task.assignee.type !== 'ai' && (
            <span className={`${s.tag} ${s.tagHuman}`}>{task.assignee.initials || task.assignee.name || 'human'}</span>
          )}
          <span className={`${s.tag} ${s.tagType}`}>{task.type}</span>
        </div>
      </div>

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
      {!isActive && (!isExpanded || taskDone) && task.description && (
        <div className={s.preview}>
          <div className={s.previewDesc}>
            <Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown>
          </div>
        </div>
      )}

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
              mentionMembers={mentionMembers}
            />
          )}
        </div>
      )}
    </div>
  );
}
