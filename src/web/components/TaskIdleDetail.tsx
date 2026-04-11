import { useEffect, useRef, useState } from 'react';
import { MemoMarkdown } from './MemoMarkdown';
import { useComments } from '../hooks/useComments';
import { useTaskFileGate } from '../hooks/useTaskFileGate';
import { useModal } from '../hooks/modal-context';
import { TaskAttachmentsView } from './TaskAttachments';
import { TaskCommentsView } from './TaskComments';
import type { JobView } from './job-types';
import type { TaskFileDependency } from '../lib/file-passing';
import type { TaskView } from '../lib/task-view';
import type { MentionMember, TaskCardMetaItem } from './task-card-types';
import s from './TaskCard.module.css';

interface TaskIdleDetailProps {
  task: TaskView;
  canRunAi: boolean;
  isBacklog?: boolean;
  projectId?: string;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  metaItems?: TaskCardMetaItem[];
  hideComments?: boolean;
  jobStatus?: JobView['status'] | null;
  fileDependency?: TaskFileDependency | null;
  commentCount?: number;
  mentionMembers?: MentionMember[];
}

export function TaskIdleDetail({
  task,
  canRunAi,
  isBacklog,
  projectId,
  onRun,
  onEdit,
  onDelete,
  onUpdateTask,
  metaItems,
  hideComments,
  jobStatus,
  fileDependency,
  commentCount = 0,
  mentionMembers,
}: TaskIdleDetailProps) {
  const modal = useModal();
  const commentsData = useComments(task.id, projectId);
  const { gate, ownArtifacts } = useTaskFileGate({ task, jobStatus, projectId, dependency: fileDependency });
  const [showComplete, setShowComplete] = useState(false);
  const [completeNote, setCompleteNote] = useState('');
  const completeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showComplete) {
      completeInputRef.current?.focus();
    }
  }, [showComplete]);

  return (
    <>
      {task.description && <div className={s.desc}><MemoMarkdown text={task.description} /></div>}
      <div className={s.meta}>
        {metaItems ? (
          metaItems.map(item => <span key={item.label}>{item.label}: {item.value}</span>)
        ) : (
          <>
            <span>
              assignee: {task.assignee && task.assignee.type !== 'ai'
                ? (task.assignee.name || task.assignee.initials)
                : task.assignee?.name || 'AI'}
            </span>
            {task.mode === 'ai' && <span>effort: {task.effort}</span>}
            {task.multiagent === 'yes' && <span>subagents: on</span>}
          </>
        )}
      </div>

      <TaskAttachmentsView artifactsData={ownArtifacts} legacyImages={task.images} readOnly />

      {gate.blocked && !gate.checking && (
        <div className={s.completionBlockedNotice}>
          {gate.message}
        </div>
      )}

      <div className={s.actions}>
        <div className={s.actionsLeft}>
          {task.assignee && task.assignee.type !== 'ai' && ['in_progress', 'todo', 'backlog'].includes(task.status || '') && onUpdateTask && (
            <button
              className="btn btnSuccess btnSm"
              onClick={() => onUpdateTask(task.id, { status: 'done' })}
              disabled={gate.blocked}
              title={gate.message || undefined}
            >
              Done
            </button>
          )}
          {(!task.assignee || task.assignee.type === 'ai') && canRunAi && onRun && (
            <button className="btn btnPrimary btnSm" onClick={() => onRun(task.id)}>
              Run
            </button>
          )}
        </div>
        <div className={s.actionsRight}>
          {isBacklog && onUpdateTask && (
            <button
              className={`btn btnGhost btnSm ${s.completeAction}`}
              onClick={() => setShowComplete(v => !v)}
              disabled={gate.blocked}
              title={gate.message || 'Mark as complete'}
            >Complete</button>
          )}
          {onEdit && (
            <button className={`btn btnGhost btnSm ${s.editAction}`} onClick={onEdit}>Edit</button>
          )}
          {onDelete && (
            <button
              className={`btn btnGhost btnSm ${s.deleteAction}`}
              onClick={async () => {
                const confirmed = await modal.confirm('Delete task', 'Delete this task?', { label: 'Delete', danger: true });
                if (confirmed) onDelete();
              }}
            >Delete</button>
          )}
        </div>
      </div>

      {showComplete && onUpdateTask && (
        <div className={s.completeComposer}>
          <input
            ref={completeInputRef}
            className={s.completeInput}
            value={completeNote}
            onChange={e => setCompleteNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && completeNote.trim()) {
                void commentsData.addComment(`Completed: ${completeNote.trim()}`);
                onUpdateTask(task.id, { status: 'done' });
                setShowComplete(false);
                setCompleteNote('');
              }
              if (e.key === 'Escape') {
                setShowComplete(false);
                setCompleteNote('');
              }
            }}
            placeholder="Completion status..."
          />
          <button
            className={`btn btnSuccess btnSm ${s.completeSubmit}`}
            disabled={!completeNote.trim()}
            onClick={() => {
              void commentsData.addComment(`Completed: ${completeNote.trim()}`);
              onUpdateTask(task.id, { status: 'done' });
              setShowComplete(false);
              setCompleteNote('');
            }}
          >Submit</button>
        </div>
      )}

      {!hideComments && (
        <TaskCommentsView
          data={commentsData}
          expectedCount={commentCount}
          mentionMembers={mentionMembers}
        />
      )}
    </>
  );
}
