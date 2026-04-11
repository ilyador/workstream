import type React from 'react';
import { clearDragPreview, setClonedDragPreview } from '../lib/drag-preview';
import { TASK_CARD_STATUS_LABELS, capTaskCardToken } from './task-card-status';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import s from './TaskCard.module.css';

interface TaskCardCompactProps {
  task: TaskView;
  jobStatus?: JobView['status'];
  taskDone: boolean;
  onDragStart?: (e?: React.DragEvent) => void;
  onDragEnd?: () => void;
  dragDisabled?: boolean;
  skipDragGhost?: boolean;
  commentCount: number;
  hasUnreadMention?: boolean;
  brokenLink?: { up: boolean; down: boolean } | null;
}

export function TaskCardCompact({
  task,
  jobStatus,
  taskDone,
  onDragStart,
  onDragEnd,
  dragDisabled,
  skipDragGhost,
  commentCount,
  hasUnreadMention,
  brokenLink,
}: TaskCardCompactProps) {
  const dotClass = jobStatus
    ? s[`dot${capTaskCardToken(jobStatus)}`]
    : taskDone ? s.dotDone : s.dotIdle;

  const tagStatusClass = jobStatus
    ? s[`tag${capTaskCardToken(jobStatus)}`]
    : '';

  return (
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
                setClonedDragPreview(card, e.dataTransfer);
              }
            }
            onDragStart?.(e);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={(e) => {
            e.stopPropagation();
            clearDragPreview();
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
            {TASK_CARD_STATUS_LABELS[jobStatus]}
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
        {task.subType && (
          <span className={`${s.tag} ${s.tagType}`}>{task.subType}</span>
        )}
      </div>
    </div>
  );
}
