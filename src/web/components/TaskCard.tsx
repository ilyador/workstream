import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { useComments } from '../hooks/useComments';
import { useMembers } from '../hooks/useMembers';
import { useModal } from '../hooks/useModal';
import { timeAgo, elapsed } from '../lib/time';
import { LiveLogs } from './LiveLogs';
import { ReplyInput } from './ReplyInput';
import type { JobView } from './job-types';
import s from './TaskCard.module.css';

function cap(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }

interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  mode: string;
  effort: string;
  multiagent?: string;
  auto_continue: boolean;
  assignee?: { type: string; name?: string; initials?: string } | null;
  images?: string[];
  status?: string;
  priority?: string;
}

interface TaskCardProps {
  task: Task;
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
  onRevert?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  dragDisabled?: boolean;
  showPriority?: boolean;
  projectId?: string;
  hasUnreadMention?: boolean;
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
  onRevert,
  onDeleteJob,
  onDragStart,
  onDragEnd,
  isDragging,
  dragDisabled,
  showPriority,
  projectId,
  hasUnreadMention,
}: TaskCardProps) {
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;

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
    : isHumanWaiting ? s.dotPaused
    : taskDone ? s.dotDone : s.dotIdle;

  const tagStatusClass = jobStatus
    ? s[`tag${cap(jobStatus)}`] : '';

  // Local elapsed timer — only ticks when this card's job is running
  const [elapsedText, setElapsedText] = useState(
    jobStatus === 'running' && job?.startedAt ? elapsed(job.startedAt) : ''
  );
  useEffect(() => {
    if (jobStatus !== 'running' || !job?.startedAt) {
      setElapsedText('');
      return;
    }
    setElapsedText(elapsed(job.startedAt));
    const interval = setInterval(() => setElapsedText(elapsed(job.startedAt!)), 1000);
    return () => clearInterval(interval);
  }, [jobStatus, job?.startedAt]);

  return (
    <div
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
              onDragStart?.();
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

        {(jobStatus || taskDone || isHumanWaiting) && <span className={`${s.statusDot} ${dotClass}`} />}
        {hasUnreadMention && <span className={s.mentionDot} />}

        <span className={s.title}>{task.title}</span>

        <div className={s.tags}>
          {!task.auto_continue && (
            <span className={s.chain} title="Manual review required">&#9646;&#9646;</span>
          )}
          {isHumanWaiting && (
            <span className={`${s.tag} ${s.tagStatus} ${s.tagPaused}`}>
              Waiting for human
            </span>
          )}
          {jobStatus && jobStatus !== 'done' && (
            <span className={`${s.tag} ${s.tagStatus} ${tagStatusClass}`}>
              {STATUS_LABELS[jobStatus]}
            </span>
          )}
          {task.assignee && task.assignee.type !== 'ai' && !isHumanWaiting && (
            <span className={`${s.tag} ${s.tagHuman}`}>{task.assignee.initials || task.assignee.name || 'human'}</span>
          )}
          <span className={`${s.tag} ${s.tagType}`}>{task.type}</span>
        </div>
      </div>

      {/* Active job detail — ALWAYS visible for running/paused/review */}
      {isActive && job && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {/* Description (read-only) */}
          {task.description && (
            <div className={s.desc}><Markdown>{task.description}</Markdown></div>
          )}

          {/* QUEUED */}
          {jobStatus === 'queued' && (
            <div className={s.runMeta}>
              <span>Queued — waiting for worker to pick up...</span>
            </div>
          )}

          {/* RUNNING */}
          {jobStatus === 'running' && (
            <>
              {job.phases && job.phases.length > 0 && (
                <div className={s.phases}>
                  {job.phases.map((p, i) => (
                    <span key={p.name} className={s.phaseWrap}>
                      {i > 0 && <span className={s.arrow}>&rarr;</span>}
                      <span className={`${s.phase} ${s[`ph${cap(p.status)}`]} ${s[`pn${cap(p.name)}`] || ''}`}>
                        {p.name}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              <div className={s.runMeta}>
                <span>{job.currentPhase || 'Starting'}</span>
                <span>attempt {job.attempt || 1}/{job.maxAttempts || 3}</span>
                {elapsedText && <strong>{elapsedText}</strong>}
              </div>
              <LiveLogs jobId={job.id} />
              {onTerminate && (
                <div className={s.terminateWrap}>
                  <button
                    className="btn btnDanger btnSm"
                    onClick={() => onTerminate(job.id)}
                  >Terminate</button>
                </div>
              )}
            </>
          )}

          {/* PAUSED */}
          {jobStatus === 'paused' && (
            <>
              {job.question && <div className={s.question}>{job.question}</div>}
              {onReply && (
                <ReplyInput onReply={(answer) => onReply(job.id, answer)} />
              )}
            </>
          )}

          {/* REVIEW */}
          {jobStatus === 'review' && (
            <div className={s.reviewSection}>
              {job.review?.changedFiles && (
                <div className={s.files}>
                  <span className={s.filesLabel}>Changed files</span>
                  {job.review.changedFiles.map(f => (
                    <code key={f} className={s.file}>{f}</code>
                  ))}
                </div>
              )}
              {job.review && (
                <div className={s.checks}>
                  <span className={s.checkOk}>&#10003; Tests pass</span>
                  <span className={s.checkOk}>&#10003; Architecture rules pass</span>
                </div>
              )}
              <div className={s.reviewActions}>
                {onApprove && (
                  <button className="btn btnSuccess btnSm" onClick={() => onApprove(job.id)}>Approve</button>
                )}
                {onReject && (
                  <button className="btn btnDanger btnSm" onClick={() => onReject(job.id)}>
                    Reject &rarr; Backlog
                  </button>
                )}
                {onRevert && (
                  <button className="btn btnWarning btnSm" onClick={() => onRevert(job.id)}>
                    Revert Changes
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Human task waiting — ALWAYS visible when in this state */}
      {isHumanWaiting && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {task.description && (
            <div className={s.desc}><Markdown>{task.description}</Markdown></div>
          )}
          <div className={s.humanWaiting}>
            <span className={s.humanWaitingLabel}>This task needs manual completion</span>
            {onUpdateTask && (
              <button
                className={`btn btnSuccess ${s.humanCompleteBtn}`}
                onClick={() => onUpdateTask(task.id, { status: 'done' })}
              >
                Complete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preview: description only (visible when collapsed and NOT active) */}
      {!isActive && !isHumanWaiting && !isExpanded && task.description && (
        <div className={s.preview}>
          <div className={s.previewDesc}>
            <Markdown>{task.description}</Markdown>
          </div>
        </div>
      )}

      {/* Expanded detail for non-active states (click to toggle) */}
      {!isActive && !isHumanWaiting && isExpanded && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {/* FAILED */}
          {jobStatus === 'failed' && job && (
            <div className={s.failedSection}>
              {job.question && <div className={s.errorMsg}>{job.question}</div>}
              <div className={s.failActions}>
                {canRunAi && onRun && (!task.assignee || task.assignee.type === 'ai') && (
                  <button className="btn btnDanger btnSm" onClick={() => onRun(task.id)}>
                    Restart
                  </button>
                )}
                {onDeleteJob && (
                  <button className="btn btnGhost btnSm" onClick={() => onDeleteJob(job.id)}>
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DONE (job completed) */}
          {jobStatus === 'done' && job && (
            <div className={s.doneSection}>
              <div className={s.doneHeader}>
                <span className={s.doneLabel}>&#10003; Completed {job.completedAgo}</span>
                {onDeleteJob && (
                  <button className="btn btnGhost btnSm" onClick={() => onDeleteJob(job.id)}>
                    Dismiss
                  </button>
                )}
              </div>
              {job.review?.summary && (
                <div className={s.doneSummary}>{job.review.summary}</div>
              )}
            </div>
          )}

          {/* IDLE — no active job, task in backlog/todo */}
          {!isActive && !taskDone && jobStatus !== 'failed' && (
            <IdleDetail
              task={task}
              canRunAi={canRunAi}
              projectId={projectId}
              onRun={onRun}
              onEdit={onEdit}
              onDelete={onDelete}
              onUpdateTask={onUpdateTask}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** Detail view for idle (backlog) tasks */
function IdleDetail({
  task,
  canRunAi,
  projectId,
  onRun,
  onEdit,
  onDelete,
  onUpdateTask,
}: {
  task: TaskCardProps['task'];
  canRunAi: boolean;
  projectId?: string;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
}) {
  const modal = useModal();

  return (
    <>
      {task.description && <div className={s.desc}><Markdown>{task.description}</Markdown></div>}
      <div className={s.meta}>
        <span>effort: {task.effort}</span>
        {task.multiagent === 'yes' && <span>subagents: on</span>}
        <span>
          assignee: {task.assignee && task.assignee.type !== 'ai'
            ? (task.assignee.name || task.assignee.initials)
            : 'AI'}
        </span>
      </div>

      {task.images && task.images.length > 0 && (
        <div className={s.images}>
          {task.images.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt={`Attachment ${i + 1}`} className={s.imageFull} />
            </a>
          ))}
        </div>
      )}

      <div className={s.actions}>
        <div className={s.actionsLeft}>
          {task.assignee && task.assignee.type !== 'ai' && onUpdateTask && (
            <>
              <button className="btn btnSuccess btnSm" onClick={() => onUpdateTask(task.id, { status: 'done' })}>
                Done
              </button>
              <button className="btn btnSecondary btnSm" onClick={() => onUpdateTask(task.id, { status: 'canceled' })}>
                Cancel
              </button>
            </>
          )}
          {(!task.assignee || task.assignee.type === 'ai') && canRunAi && onRun && (
            <button className="btn btnPrimary btnSm" onClick={() => onRun(task.id)}>
              Run
            </button>
          )}
        </div>
        <div className={s.actionsRight}>
          {onEdit && (
            <button className="btn btnGhost btnSm" onClick={onEdit}>Edit</button>
          )}
          {onDelete && (
            <button
              className="btn btnGhost btnSm"
              style={{ color: 'var(--red)' }}
              onClick={async () => { if (await modal.confirm('Delete task', 'Delete this task?', { label: 'Delete', danger: true })) onDelete(); }}
            >Delete</button>
          )}
        </div>
      </div>

      <CardComments taskId={task.id} projectId={projectId} />
    </>
  );
}

/** Inline comments for a task card */
function CardComments({ taskId, projectId }: { taskId: string; projectId?: string }) {
  const { comments, addComment, removeComment } = useComments(taskId);
  const { members } = useMembers(projectId || null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionMatches = mentionQuery !== null
    ? members.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await addComment(body);
      setText('');
      setMentionQuery(null);
      if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    } finally {
      setSending(false);
    }
  };

  const insertMention = (name: string) => {
    const input = inputRef.current;
    if (!input) return;
    const cursor = input.selectionStart || 0;
    // Find the @ that started this mention
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx < 0) return;
    const after = text.slice(cursor);
    setText(before.slice(0, atIdx) + `@${name} ` + after);
    setMentionQuery(null);
    setTimeout(() => {
      const newPos = atIdx + name.length + 2;
      input.focus();
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const adjustHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // Auto-resize textarea after text changes
  useEffect(() => { adjustHeight(); }, [text]);

  const handleChange = (val: string) => {
    setText(val);
    const cursor = inputRef.current?.selectionStart || val.length;
    const before = val.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
    } else {
      setMentionQuery(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionMatches.length > 0 && mentionQuery !== null) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIdx].name); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', display: 'block', marginBottom: 6 }}>
        Comments
      </span>
      {comments.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-4)', display: 'block', marginBottom: 6 }}>
          No comments yet
        </span>
      )}
      {comments.map(c => (
        <div key={c.id} className={s.comment}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-active)', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, flexShrink: 0,
          }}>{c.profiles?.initials || '??'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, display: 'block', whiteSpace: 'pre-wrap' }}>{c.body}</span>
            <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{timeAgo(c.created_at)}</span>
          </div>
          <button
            className={s.commentDelete}
            onClick={() => removeComment(c.id)}
            title="Delete comment"
          >&times;</button>
        </div>
      ))}
      <div style={{ position: 'relative' }}>
        {mentionMatches.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4,
            background: 'var(--white)', border: '1px solid var(--divider)', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', zIndex: 10,
          }}>
            {mentionMatches.map((m, i) => (
              <div
                key={m.id}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 12,
                  background: i === mentionIdx ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-active)', color: 'var(--text-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 600, flexShrink: 0,
                }}>{m.initials}</span>
                {m.name}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <textarea
            ref={inputRef}
            rows={1}
            style={{
              flex: 1, padding: '4px 10px', background: 'var(--white)', border: '1.5px solid var(--divider)',
              borderRadius: 6, fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text)', outline: 'none',
              resize: 'none', minHeight: 28, maxHeight: 120, overflowY: 'auto',
            }}
            value={text}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a comment... (@mention)"
            disabled={sending}
          />
          <button className="btn btnPrimary btnSm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleSend} disabled={sending || !text.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
