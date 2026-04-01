import { useState } from 'react';
import { useComments } from '../hooks/useComments';
import { timeAgo } from '../lib/time';
import s from './Backlog.module.css';

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  blocked: boolean;
  blockedBy?: string;
  blockedByTitles?: string[];
  blockedByIds?: string[];
  assignee: { type: string; name?: string; initials?: string };
  assigneeId?: string | null;
  images?: string[];
  status?: string;
  milestone_id?: string | null;
}

interface Milestone {
  id: string;
  name: string;
}

interface BacklogProps {
  tasks: Task[];
  onAddTask?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onSwapTasks?: (idA: string, idB: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onEditTask?: (task: Task) => void;
  milestoneFilter?: string | null;
  milestones?: Milestone[];
  onMilestoneFilter?: (id: string | null) => void;
}

export function Backlog({ tasks, onAddTask, onUpdateTask, onSwapTasks, onDeleteTask, onEditTask, milestoneFilter, milestones, onMilestoneFilter }: BacklogProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const filteredTasks = milestoneFilter
    ? tasks.filter(t => t.milestone_id === milestoneFilter)
    : tasks;

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Backlog</span>
        <span className={s.count}>{filteredTasks.length}</span>
        {milestones && milestones.length > 0 && onMilestoneFilter && (
          <select
            className={s.milestoneSelect}
            value={milestoneFilter || ''}
            onChange={e => onMilestoneFilter(e.target.value || null)}
          >
            <option value="">All</option>
            {milestones.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
      <div className={s.list}>
        {filteredTasks.map((task) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (task.id !== draggedId) {
                setDropTarget(task.id);
              }
            }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedId && draggedId !== task.id) {
                onSwapTasks?.(draggedId, task.id);
              }
              setDraggedId(null);
              setDropTarget(null);
            }}
            className={`${s.item} ${task.blocked ? s.blockedItem : ''} ${expanded === task.id ? s.expanded : ''} ${dropTarget === task.id ? s.dropTarget : ''} ${draggedId === task.id ? s.dragging : ''}`}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div className={s.row}>
              <span
                className={s.handle}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDraggedId(task.id);
                  e.dataTransfer.effectAllowed = 'move';
                  // Find the parent item and dim it
                  const item = (e.target as HTMLElement).closest(`.${s.item}`);
                  if (item instanceof HTMLElement) item.style.opacity = '0.4';
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDropTarget(null);
                  // Restore all items
                  document.querySelectorAll(`.${s.item}`).forEach(el => {
                    (el as HTMLElement).style.opacity = '';
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                title="Drag to reorder"
              >&#8942;&#8942;</span>
              <span className={s.title}>{task.title}</span>
              {task.blocked && <span className={s.tag + ' ' + s.tagRed}>blocked</span>}
              {task.mode === 'human' && <span className={s.tag + ' ' + s.tagGray}>human</span>}
              <span className={s.tag + ' ' + s.tagLight}>{task.type}</span>
            </div>
            {expanded === task.id && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                <div className={s.detailHeader}>
                  {task.description && <p className={s.desc} style={{ marginBottom: 0 }}>{task.description}</p>}
                  {onEditTask && (
                    <button
                      className={`btn btnGhost ${s.editBtn}`}
                      onClick={() => onEditTask(task)}
                    >Edit</button>
                  )}
                </div>
                <div className={s.detailMeta}>
                  <span>effort: {task.effort}</span>
                  <span>mode: {task.mode}</span>
                  {task.multiagent === 'yes' && <span>subagents: on</span>}
                  <span>assignee: {task.assignee.type === 'ai' ? 'AI' : (task.assignee.name || task.assignee.initials)}</span>
                </div>
                {task.blockedByTitles && task.blockedByTitles.length > 0 && (
                  <div className={s.detailBlockers}>
                    <span className={s.detailBlockersLabel}>blocked by:</span>
                    {task.blockedByTitles.map((title, i) => (
                      <span key={i} className={s.detailBlockerTag}>{title}</span>
                    ))}
                  </div>
                )}
                {task.images && task.images.length > 0 && (
                  <div className={s.detailImages}>
                    {task.images.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={s.detailImageWrap}>
                        <img src={url} alt={`Attachment ${i + 1}`} className={s.detailImage} />
                      </a>
                    ))}
                  </div>
                )}
                {task.mode === 'human' && (
                  <div className={s.humanActions}>
                    <button
                      className="btn btnPrimary btnSm"
                      onClick={() => onUpdateTask?.(task.id, { status: 'in_progress' })}
                    >Start</button>
                    <button
                      className="btn btnSuccess btnSm"
                      onClick={() => onUpdateTask?.(task.id, { status: 'done' })}
                    >Done</button>
                    <button
                      className="btn btnSecondary btnSm"
                      onClick={() => onUpdateTask?.(task.id, { status: 'canceled' })}
                    >Cancel</button>
                  </div>
                )}
                <CommentsSection taskId={task.id} />
                <button className={`btn btnGhost ${s.deleteWrap}`} style={{ color: 'var(--red)' }} onClick={(e) => { e.stopPropagation(); if (confirm('Delete this task?')) onDeleteTask?.(task.id); }}>
                  Delete task
                </button>
              </div>
            )}
          </div>
        ))}
        <div className={s.addRow} onClick={onAddTask}>+ Add task</div>
      </div>
    </section>
  );
}

function CommentsSection({ taskId }: { taskId: string }) {
  const { comments, addComment } = useComments(taskId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(body);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={s.comments}>
      <span className={s.commentsLabel}>Comments</span>
      {comments.length === 0 && <span className={s.commentsEmpty}>No comments yet</span>}
      {comments.map(c => (
        <div key={c.id} className={s.comment}>
          <span className={s.commentAuthor}>{c.profiles?.initials || '??'}</span>
          <div className={s.commentContent}>
            <span className={s.commentBody}>{c.body}</span>
            <span className={s.commentTime}>{timeAgo(c.created_at)}</span>
          </div>
        </div>
      ))}
      <div className={s.commentInput}>
        <input
          className={s.commentField}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Add a comment..."
          disabled={sending}
        />
        <button className="btn btnPrimary btnSm" onClick={handleSend} disabled={sending || !text.trim()}>
          Send
        </button>
      </div>
      <span className={s.commentHint}>Use @name to mention someone</span>
    </div>
  );
}
