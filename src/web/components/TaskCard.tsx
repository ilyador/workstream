import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useComments } from '../hooks/useComments';
import { useMembers } from '../hooks/useMembers';
import { useArtifacts } from '../hooks/useArtifacts';
import { getFileIcon, formatFileSize } from '../lib/file-utils';
import { useModal } from '../hooks/useModal';
import { useFilePreview } from './FilePreview';
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
  chaining?: 'none' | 'produce' | 'accept' | 'both';
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
  projectId?: string;
  hasUnreadMention?: boolean;
  commentCount?: number;
  brokenLink?: { up: boolean; down: boolean } | null;
  metaItems?: { label: string; value: string }[];
  hideComments?: boolean;
  prevTaskId?: string | null;
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
  projectId,
  hasUnreadMention,
  commentCount = 0,
  brokenLink,
  metaItems,
  hideComments,
  prevTaskId,
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

  const [showRework, setShowRework] = useState(false);
  const [showDoneReject, setShowDoneReject] = useState(false);

  // Eagerly fetch comments so data is ready before expansion
  const commentsData = useComments(task.id);

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
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {/* Description (read-only) */}
          {task.description && (
            <div className={s.desc}><Markdown remarkPlugins={[remarkGfm]}>{task.description}</Markdown></div>
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
                  <span className={s.runStats}>
                    <span>attempt {job.attempt || 1}/{job.maxAttempts || 3}</span>
                    {elapsedText && <span className={s.elapsed}>{elapsedText}</span>}
                  </span>
                </div>
              )}
              {job.phases.some(p => p.status === 'completed' && p.summary) && (
                <div className={s.stepSummaries}>
                  {job.phases.filter(p => p.status === 'completed' && p.summary).map(p => (
                    <div key={p.name} className={s.stepSummary}>
                      <span className={s.stepName}>{p.name}</span> {p.summary}
                    </div>
                  ))}
                </div>
              )}
              {job.question && (
                <div className={s.retryBanner}>{job.question}</div>
              )}
              <LiveLogs jobId={job.id} footer={
                onTerminate && (
                  <button className="btn btnDanger btnSm" onClick={() => onTerminate(job.id)}>Terminate</button>
                )
              } />
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
              <TaskAttachments taskId={task.id} legacyImages={task.images} readOnly />
              {job.review?.changedFiles && (
                <div className={s.files}>
                  <span className={s.filesLabel}>Changed files</span>
                  {job.review.changedFiles.map(f => (
                    <code key={f} className={s.file}>{f}</code>
                  ))}
                </div>
              )}
              {job.review && (job.review.filesChanged ?? 0) > 0 && (
                <div className={s.checks}>
                  <span className={s.checkOk}>&#10003; Tests pass</span>
                  <span className={s.checkOk}>&#10003; Architecture rules pass</span>
                </div>
              )}
              <div className={s.reviewActions}>
                {onApprove && (
                  <button className="btn btnSuccess btnSm" onClick={() => onApprove(job.id)}>Approve</button>
                )}
                {onRework && (
                  <button className="btn btnWarning btnSm" onClick={() => setShowRework(v => !v)} title="Give feedback and re-run the task">Rework</button>
                )}
                {onReject && (
                  <button className="btn btnDanger btnSm" onClick={() => onReject(job.id)} title="Undo all changes and reset the task">Reject</button>
                )}
              </div>
              {showRework && onRework && (
                <ReplyInput onReply={(answer) => { onRework(job.id, answer); setShowRework(false); }} placeholder="What should change?" />
              )}
            </div>
          )}
        </div>
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
      {!isActive && isExpanded && taskDone && jobStatus === 'done' && job && (
        <div onClick={(e) => e.stopPropagation()} style={{ padding: '0 12px 10px' }}>
          <div className={s.doneSection}>
            <div className={s.doneHeader}>
              <span className={s.doneLabel}>&#10003; Completed {job.completedAgo}</span>
              <button className="btn btnWarning btnSm" onClick={() => setShowDoneReject(v => !v)}>Reject</button>
            </div>
            {showDoneReject && (
              <div className={s.doneRejectPanel}>
                {onRework && (
                  <ReplyInput
                    onReply={(answer) => { onRework(job.id, answer); setShowDoneReject(false); }}
                    placeholder="What needs to change?"
                  />
                )}
                {onMoveToBacklog && (
                  <button className="btn btnGhost btnSm" onClick={() => onMoveToBacklog(job.id)}>
                    Move to backlog
                  </button>
                )}
              </div>
            )}
            {job.review?.summary && (
              <div className={s.doneSummary}>{job.review.summary}</div>
            )}
            <TaskAttachments taskId={task.id} legacyImages={task.images} readOnly />
            <CardComments data={commentsData} projectId={projectId} />
          </div>
        </div>
      )}

      {/* Expanded detail for non-active states (click to toggle) */}
      {!isActive && isExpanded && !taskDone && (
        <div className={s.detail} onClick={(e) => e.stopPropagation()}>
          {/* FAILED */}
          {jobStatus === 'failed' && job && (
            <div className={s.failedSection}>
              {job.phases && job.phases.length > 0 && (
                <div className={s.phases}>
                  {job.phases.map((p, i) => (
                    <span key={p.name} className={s.phaseWrap}>
                      {i > 0 && <span className={s.arrow}>&rarr;</span>}
                      <span className={`${s.phase} ${s[`ph${cap(p.status)}`]} ${s[`pn${cap(p.name)}`] || ''}`}>
                        {p.status === 'completed' && <span style={{ color: 'var(--green)', marginRight: 3 }}>&#10003;</span>}
                        {p.name}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {job.question && <div className={s.errorMsg}>{job.question}</div>}
              <div className={s.failActions}>
                {onContinue && job.phases?.some(p => p.status === 'completed') && (() => {
                  const nextPhase = job.phases?.find(p => p.status !== 'completed');
                  return (
                    <button className="btn btnPrimary btnSm" onClick={() => onContinue(job.id)}>
                      Retry {nextPhase?.name || 'next step'}
                    </button>
                  );
                })()}
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
              metaItems={metaItems}
              hideComments={hideComments}
              commentsData={commentsData}
              prevTaskId={prevTaskId}
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
  metaItems,
  hideComments,
  commentsData,
  prevTaskId,
}: {
  task: TaskCardProps['task'];
  canRunAi: boolean;
  projectId?: string;
  onRun?: (taskId: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  metaItems?: { label: string; value: string }[];
  hideComments?: boolean;
  commentsData: ReturnType<typeof useComments>;
  prevTaskId?: string | null;
}) {
  const modal = useModal();
  const ownArtifacts = useArtifacts(task.id);
  const prevArtifacts = useArtifacts(prevTaskId || null);

  // Chaining completion rules
  const chaining = task.chaining || 'none';
  const needsAccept = chaining === 'accept' || chaining === 'both';
  const needsProduce = chaining === 'produce' || chaining === 'both';
  const acceptBlocked = needsAccept && (!prevArtifacts.loaded || prevArtifacts.artifacts.length === 0);
  const produceBlocked = needsProduce && (!ownArtifacts.loaded || ownArtifacts.artifacts.length === 0);
  const completionBlocked = acceptBlocked || produceBlocked;
  const blockReason = acceptBlocked ? 'Awaiting file from previous task' : produceBlocked ? 'Attach a file before completing' : '';

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

      <TaskAttachments taskId={task.id} legacyImages={task.images} readOnly />

      {completionBlocked && (
        <div style={{ padding: '8px 12px', background: 'var(--amber-bg)', borderLeft: '3px solid var(--amber)', borderRadius: 6, fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>
          {blockReason}
        </div>
      )}

      <div className={s.actions}>
        <div className={s.actionsLeft}>
          {task.assignee && task.assignee.type !== 'ai' && ['in_progress', 'todo', 'backlog'].includes(task.status || '') && onUpdateTask && (
            <>
              <button className="btn btnSuccess btnSm" onClick={() => onUpdateTask(task.id, { status: 'done' })} disabled={completionBlocked} title={blockReason || undefined}>
                Done
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

      {!hideComments && <CardComments data={commentsData} projectId={projectId} />}
    </>
  );
}

/** Attachments section using artifacts API */
function TaskAttachments({ taskId, legacyImages, readOnly }: { taskId: string; legacyImages?: string[]; readOnly?: boolean }) {
  const { artifacts, loaded, upload, remove } = useArtifacts(taskId);
  const { preview } = useFilePreview();
  // Include legacy task.images as read-only artifacts for backward compat
  const legacyArtifacts = (legacyImages || []).map((url, i) => ({
    id: `legacy-${i}`,
    url,
    filename: url.split('/').pop() || `image-${i + 1}`,
    mime_type: 'image/*',
    size_bytes: 0,
    isLegacy: true,
  }));
  const allFiles = [...artifacts.map(a => ({ ...a, isLegacy: false })), ...legacyArtifacts];
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!loaded) return null;
  if (readOnly && allFiles.length === 0) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) upload(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files || [])) upload(file);
    e.target.value = '';
  };


  return (
    <div className={s.attachments}>
      <div className={s.attachmentsHeader}>
        <span>Attachments{allFiles.length > 0 ? ` (${allFiles.length})` : ''}</span>
        {!readOnly && (
          <>
            <button className={s.attachAddBtn} onClick={() => fileInputRef.current?.click()}>+ Add</button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileSelect} />
          </>
        )}
      </div>
      {allFiles.length > 0 ? (
        <div className={s.attachList} {...(!readOnly ? { onDragOver: (e: React.DragEvent) => e.preventDefault(), onDrop: handleDrop } : {})}>
          {allFiles.map(a => (
            <div key={a.id} className={s.attachItem} onClick={(e) => { e.stopPropagation(); preview(a); }} style={{ cursor: 'pointer' }}>
              {a.mime_type.startsWith('image/') ? (
                <img src={a.url} alt={a.filename} className={s.attachThumb} />
              ) : (
                <span className={s.attachIcon}>{getFileIcon(a.mime_type)}</span>
              )}
              <div className={s.attachInfo}>
                <span className={s.attachName}>{a.filename}</span>
                {a.size_bytes > 0 && <span className={s.attachSize}>{formatFileSize(a.size_bytes)}</span>}
              </div>
              {!readOnly && !a.isLegacy && <button className={s.attachDelete} onClick={(e) => { e.stopPropagation(); remove(a.id); }} title="Remove">&times;</button>}
            </div>
          ))}
        </div>
      ) : !readOnly ? (
        <div className={s.attachDropZone} onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
          Drop files here
        </div>
      ) : null}
    </div>
  );
}

/** Inline comments for a task card */
function CardComments({ data, projectId }: { data: ReturnType<typeof useComments>; projectId?: string }) {
  const { comments, addComment, removeComment } = data;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Comments</span>
        {comments.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-4)' }}>No comments yet</span>
        )}
      </div>
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
