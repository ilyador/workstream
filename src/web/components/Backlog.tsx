import { useState } from 'react';
import { useComments } from '../hooks/useComments';
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
  assignee: { type: string; name?: string; initials?: string };
  images?: string[];
  status?: string;
}

interface BacklogProps {
  tasks: Task[];
  onAddTask?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onSwapTasks?: (idA: string, idB: string) => void;
  onDeleteTask?: (taskId: string) => void;
}

export function Backlog({ tasks, onAddTask, onUpdateTask, onSwapTasks, onDeleteTask }: BacklogProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Backlog</span>
        <span className={s.count}>{tasks.length}</span>
      </div>
      <div className={s.list}>
        {tasks.map((task, idx) => (
          <div
            key={task.id}
            className={`${s.item} ${task.blocked ? s.blockedItem : ''} ${expanded === task.id ? s.expanded : ''}`}
            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
          >
            <div className={s.row}>
              <div className={s.reorderBtns}>
                <button
                  className={s.reorderBtn}
                  disabled={idx === 0}
                  title="Move up"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (idx > 0) onSwapTasks?.(task.id, tasks[idx - 1].id);
                  }}
                >&#9650;</button>
                <button
                  className={s.reorderBtn}
                  disabled={idx === tasks.length - 1}
                  title="Move down"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (idx < tasks.length - 1) onSwapTasks?.(task.id, tasks[idx + 1].id);
                  }}
                >&#9660;</button>
              </div>
              <span className={s.title}>{task.title}</span>
              {task.blocked && <span className={s.tag + ' ' + s.tagRed}>blocked</span>}
              {task.mode === 'human' && <span className={s.tag + ' ' + s.tagGray}>human</span>}
              <span className={s.tag + ' ' + s.tagLight}>{task.type}</span>
            </div>
            {expanded === task.id && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {task.description && <p className={s.desc}>{task.description}</p>}
                <div className={s.detailMeta}>
                  <span>effort: {task.effort}</span>
                  <span>mode: {task.mode}</span>
                  {task.multiagent && <span>multiagent: {task.multiagent}</span>}
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
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={s.detailImageLink}>
                        <img src={url} alt={`Attachment ${i + 1}`} className={s.detailImageThumb} />
                      </a>
                    ))}
                  </div>
                )}
                {task.mode === 'human' && (
                  <div className={s.humanActions}>
                    <button
                      className={s.humanBtn}
                      onClick={() => onUpdateTask?.(task.id, { status: 'in_progress' })}
                    >Start</button>
                    <button
                      className={`${s.humanBtn} ${s.humanBtnDone}`}
                      onClick={() => onUpdateTask?.(task.id, { status: 'done' })}
                    >Done</button>
                    <button
                      className={`${s.humanBtn} ${s.humanBtnCancel}`}
                      onClick={() => onUpdateTask?.(task.id, { status: 'canceled' })}
                    >Cancel</button>
                  </div>
                )}
                <CommentsSection taskId={task.id} />
                <button className={s.deleteBtn} onClick={(e) => { e.stopPropagation(); if (confirm('Delete this task?')) onDeleteTask?.(task.id); }}>
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
            <span className={s.commentTime}>{new Date(c.created_at).toLocaleString()}</span>
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
        <button className={s.commentSend} onClick={handleSend} disabled={sending || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
