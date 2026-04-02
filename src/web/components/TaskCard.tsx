import { useState } from 'react';
import Markdown from 'react-markdown';
import { useComments } from '../hooks/useComments';
import { timeAgo } from '../lib/time';
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
}: TaskCardProps) {
  const jobStatus = job?.status;
  const isActive = jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'paused' || jobStatus === 'review';
  const taskDone = task.status === 'done' || jobStatus === 'done';
  const isHumanWaiting = task.mode === 'human' && task.status === 'in_progress' && !isActive;

  const statusClass = jobStatus
    ? s[`status${cap(jobStatus)}`]
    : isHumanWaiting ? s.statusPaused
    : taskDone ? s.statusDone : '';

  // Priority: background tint always, border only when no active status border
  const hasStatusBorder = !!statusClass;
  const priorityBgClass = task.priority === 'critical' ? s.priorityCriticalBg
    : task.priority === 'upcoming' ? s.priorityUpcomingBg
    : '';
  const priorityBorderClass = !hasStatusBorder && task.priority === 'critical' ? s.priorityCriticalBorder
    : !hasStatusBorder && task.priority === 'upcoming' ? s.priorityUpcomingBorder
    : '';

  const dotClass = jobStatus
    ? s[`dot${cap(jobStatus)}`]
    : isHumanWaiting ? s.dotPaused
    : taskDone ? s.dotDone : s.dotIdle;

  const tagStatusClass = jobStatus
    ? s[`tag${cap(jobStatus)}`] : '';

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
                {job.elapsed && <strong>{job.elapsed}</strong>}
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

      {/* Preview: description + image thumbnails (visible when collapsed and NOT active) */}
      {!isActive && !isHumanWaiting && !isExpanded && (task.description || (task.images && task.images.length > 0)) && (
        <div className={s.preview}>
          {task.description && (
            <div className={s.previewDesc}>
              <Markdown>{task.description}</Markdown>
            </div>
          )}
          {task.images && task.images.length > 0 && (
            <div className={s.previewImages}>
              {task.images.slice(0, 5).map((url) => (
                <img key={url} src={url} alt="" className={s.previewThumb} />
              ))}
            </div>
          )}
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
  onRun,
  onEdit,
  onDelete,
  onUpdateTask,
}: {
  task: TaskCardProps['task'];
  canRunAi: boolean;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
}) {
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
              <img src={url} alt={`Attachment ${i + 1}`} className={s.imageThumb} />
            </a>
          ))}
        </div>
      )}

      {task.assignee && task.assignee.type !== 'ai' && onUpdateTask && (
        <div className={s.humanActions}>
          <button className="btn btnPrimary btnSm" onClick={() => onUpdateTask(task.id, { status: 'in_progress' })}>
            Start
          </button>
          <button className="btn btnSuccess btnSm" onClick={() => onUpdateTask(task.id, { status: 'done' })}>
            Done
          </button>
          <button className="btn btnSecondary btnSm" onClick={() => onUpdateTask(task.id, { status: 'canceled' })}>
            Cancel
          </button>
        </div>
      )}

      <div className={s.idleActions}>
        {(!task.assignee || task.assignee.type === 'ai') && canRunAi && onRun && (
          <button className="btn btnPrimary btnSm" onClick={() => onRun(task.id)}>
            Run
          </button>
        )}
        {onEdit && (
          <button className="btn btnGhost btnSm" onClick={onEdit}>Edit</button>
        )}
        {onDelete && (
          <button
            className="btn btnGhost btnSm"
            style={{ color: 'var(--red)' }}
            onClick={() => { if (confirm('Delete this task?')) onDelete(); }}
          >Delete</button>
        )}
      </div>

      <CardComments taskId={task.id} />
    </>
  );
}

/** Inline comments for a task card */
function CardComments({ taskId }: { taskId: string }) {
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
        <div key={c.id} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
          <span style={{
            width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-active)', color: 'var(--text-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 600, flexShrink: 0,
          }}>{c.profiles?.initials || '??'}</span>
          <div>
            <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4, display: 'block' }}>{c.body}</span>
            <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{timeAgo(c.created_at)}</span>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          style={{
            flex: 1, padding: '4px 10px', background: 'var(--white)', border: '1.5px solid var(--divider)',
            borderRadius: 6, fontFamily: 'var(--font)', fontSize: 12, color: 'var(--text)', outline: 'none',
          }}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Add a comment..."
          disabled={sending}
        />
        <button className="btn btnPrimary btnSm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={handleSend} disabled={sending || !text.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
