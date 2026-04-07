import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useArtifacts } from '../hooks/useArtifacts';
import { useComments } from '../hooks/useComments';
import { useModal } from '../hooks/modal-context';
import { TaskAttachmentsView } from './TaskAttachments';
import { TaskCommentsView } from './TaskComments';
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
  prevTaskId?: string | null;
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
  prevTaskId,
  mentionMembers,
}: TaskIdleDetailProps) {
  const modal = useModal();
  const commentsData = useComments(task.id, projectId);
  const ownArtifacts = useArtifacts(task.id, projectId);
  const prevArtifacts = useArtifacts(prevTaskId || null, projectId);
  const [showComplete, setShowComplete] = useState(false);
  const [completeNote, setCompleteNote] = useState('');
  const completeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showComplete) {
      completeInputRef.current?.focus();
    }
  }, [showComplete]);

  const chaining = task.chaining || 'none';
  const needsAccept = chaining === 'accept' || chaining === 'both';
  const needsProduce = chaining === 'produce' || chaining === 'both';
  const missingPreviousTask = needsAccept && !prevTaskId;
  const checkingAcceptArtifacts = needsAccept && !!prevTaskId && !prevArtifacts.loaded && !prevArtifacts.error;
  const checkingProduceArtifacts = needsProduce && !ownArtifacts.loaded && !ownArtifacts.error;
  const acceptCheckFailed = needsAccept && !!prevTaskId && !!prevArtifacts.error;
  const produceCheckFailed = needsProduce && !!ownArtifacts.error;
  const acceptBlocked = missingPreviousTask || acceptCheckFailed || (needsAccept && prevArtifacts.loaded && prevArtifacts.artifacts.length === 0);
  const produceBlocked = produceCheckFailed || (needsProduce && ownArtifacts.loaded && ownArtifacts.artifacts.length === 0);
  const completionChecking = checkingAcceptArtifacts || checkingProduceArtifacts;
  const completionBlocked = acceptBlocked || produceBlocked || completionChecking;
  let blockReason = '';
  if (missingPreviousTask) blockReason = 'Previous task file is unavailable';
  else if (acceptCheckFailed) blockReason = 'Failed to check previous task file';
  else if (produceCheckFailed) blockReason = 'Failed to check required files';
  else if (acceptBlocked) blockReason = 'Awaiting file from previous task';
  else if (produceBlocked) blockReason = 'Attach a file before completing';
  else if (completionChecking) blockReason = 'Checking required files...';

  return (
    <>
      {task.description && <div className={s.desc}><Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown></div>}
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

      {completionBlocked && !completionChecking && (
        <div className={s.completionBlockedNotice}>
          {blockReason}
        </div>
      )}

      <div className={s.actions}>
        <div className={s.actionsLeft}>
          {task.assignee && task.assignee.type !== 'ai' && ['in_progress', 'todo', 'backlog'].includes(task.status || '') && onUpdateTask && (
            <button
              className="btn btnSuccess btnSm"
              onClick={() => onUpdateTask(task.id, { status: 'done' })}
              disabled={completionBlocked}
              title={blockReason || undefined}
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
              disabled={completionBlocked}
              title={blockReason || 'Mark as complete'}
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
          mentionMembers={mentionMembers}
        />
      )}
    </>
  );
}
