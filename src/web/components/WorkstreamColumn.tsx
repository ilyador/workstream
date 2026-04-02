import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useModal } from '../hooks/useModal';
import { TaskCard } from './TaskCard';
import type { JobView } from './job-types';
import s from './WorkstreamColumn.module.css';

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

interface Workstream {
  id: string;
  name: string;
  status: string;
  position: number;
  pr_url?: string | null;
}

interface WorkstreamColumnProps {
  workstream: Workstream | null;
  tasks: Task[];
  taskJobMap: Record<string, JobView>;
  isBacklog: boolean;
  canRunAi: boolean;
  projectId: string | null;
  // Drag
  draggedTaskId: string | null;
  onDragTaskStart: (taskId: string) => void;
  onDragTaskEnd: () => void;
  onDropTask: (workstreamId: string | null, dropIndex: number) => void;
  // Column actions
  onRenameWorkstream?: (id: string, name: string) => void;
  onDeleteWorkstream?: (id: string) => void;
  // Task actions
  onAddTask: () => void;
  onRunWorkstream?: () => void;
  onRunTask?: (taskId: string) => void;
  onEditTask?: (task: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  // Job actions
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRevert?: (jobId: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onCreatePr?: () => void;
  onArchive?: () => void;
}

export function WorkstreamColumn({
  workstream,
  tasks,
  taskJobMap,
  isBacklog,
  canRunAi,
  projectId,
  draggedTaskId,
  onDragTaskStart,
  onDragTaskEnd,
  onDropTask,
  onRenameWorkstream,
  onDeleteWorkstream,
  onAddTask,
  onRunWorkstream,
  onRunTask,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRevert,
  onDeleteJob,
  onCreatePr,
  onArchive,
}: WorkstreamColumnProps) {
  const modal = useModal();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(workstream?.name || '');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const dropIndexRef = useRef<number | null>(null);
  const dragCountRef = useRef(0); // track enter/leave balance to handle child elements

  const wsId = workstream?.id || null;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Derive workstream status for display
  const wsStatus = useMemo(() => {
    if (isBacklog) return null;
    const dbStatus = workstream?.status;
    if (dbStatus === 'reviewing') return 'reviewing' as const;
    if (dbStatus === 'review_failed') return 'review failed' as const;
    if (dbStatus === 'complete') return 'done' as const;
    if (dbStatus === 'archived') return 'merged' as const;
    if (totalTasks === 0) return 'open' as const;
    const hasActiveTask = tasks.some(t => {
      const job = taskJobMap[t.id];
      if (job && ['queued', 'running', 'paused', 'review'].includes(job.status)) return true;
      if (t.mode === 'human' && t.status === 'in_progress') return true;
      return false;
    });
    if (hasActiveTask) return 'in progress' as const;
    const hasFailedTask = tasks.some(t => {
      const job = taskJobMap[t.id];
      return job && job.status === 'failed';
    });
    if (hasFailedTask) return 'failed' as const;
    if (allDone) return 'pending review' as const;
    if (doneTasks > 0) return 'in progress' as const;
    return 'open' as const;
  }, [isBacklog, workstream?.status, totalTasks, doneTasks, allDone, tasks, taskJobMap]);

  // Track active AI job (for drag locking) and active task including human (for auto-expand)
  const activeAiJobId = useMemo(() => {
    const t = tasks.find(t => {
      const job = taskJobMap[t.id];
      return job && ['queued', 'running', 'paused', 'review'].includes(job.status);
    });
    return t?.id ?? null;
  }, [tasks, taskJobMap]);

  const activeTaskId = useMemo(() => {
    if (activeAiJobId) return activeAiJobId;
    const human = tasks.find(t => t.mode === 'human' && t.status === 'in_progress' && !taskJobMap[t.id]);
    return human?.id ?? null;
  }, [tasks, taskJobMap, activeAiJobId]);

  // Disable drag only when an AI job is actively running (not for human waiting)
  const dragDisabled = !isBacklog && activeAiJobId !== null;

  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTaskId && activeTaskId !== prevActiveRef.current) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(activeTaskId);
        return next;
      });
    }
    prevActiveRef.current = activeTaskId;
  }, [activeTaskId]);

  // Focus name input when editing
  useEffect(() => {
    if (editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editing]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && workstream && trimmed !== workstream.name) {
      onRenameWorkstream?.(workstream.id, trimmed);
    }
    setEditing(false);
  };

  // --- Drag indicator via DOM classes (no React state, no re-renders) ---

  const clearDropIndicator = useCallback(() => {
    const container = tasksRef.current;
    if (!container) return;
    container.querySelectorAll(`.${s.dropBefore}, .${s.dropAfter}`).forEach(el => {
      el.classList.remove(s.dropBefore, s.dropAfter);
    });
  }, []);

  const updateDropIndicator = useCallback((clientY: number) => {
    const container = tasksRef.current;
    if (!container || !draggedTaskId) return;
    const wraps = Array.from(container.querySelectorAll<HTMLElement>(`.${s.cardWrap}`));
    clearDropIndicator();

    let idx = wraps.length;
    for (let i = 0; i < wraps.length; i++) {
      const rect = wraps[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        idx = i;
        break;
      }
    }
    dropIndexRef.current = idx;

    // Apply CSS class to show a drop indicator line
    if (idx < wraps.length) {
      wraps[idx].classList.add(s.dropBefore);
    } else if (wraps.length > 0) {
      wraps[wraps.length - 1].classList.add(s.dropAfter);
    }
  }, [draggedTaskId, clearDropIndicator]);

  return (
    <div
      className={`${s.column} ${isBacklog ? s.backlog : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCountRef.current++;
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={() => {
        dragCountRef.current--;
        if (dragCountRef.current <= 0) {
          dragCountRef.current = 0;
          clearDropIndicator();
          dropIndexRef.current = null;
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        clearDropIndicator();
        dragCountRef.current = 0;
        if (draggedTaskId && dropIndexRef.current !== null) {
          onDropTask(wsId, dropIndexRef.current);
        }
        dropIndexRef.current = null;
      }}
    >
      {/* Header */}
      <div className={s.headerWrap}>
        <div className={s.header}>
          {editing && !isBacklog ? (
            <input
              ref={nameInputRef}
              className={s.nameInput}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <span
              className={s.name}
              onDoubleClick={() => {
                if (!isBacklog && workstream) {
                  setEditName(workstream.name);
                  setEditing(true);
                }
              }}
              title={isBacklog ? undefined : 'Double-click to rename'}
            >
              {isBacklog ? 'Backlog' : workstream?.name}
            </span>
          )}

          {/* Status pill next to name (no count -- progress line shows progress) */}
          {!isBacklog && totalTasks > 0 && wsStatus && wsStatus !== 'open' && (
            <span className={`${s.statusPill} ${s[`statusPill--${wsStatus.replace(' ', '-')}`] || ''}`}>
              {wsStatus}
            </span>
          )}

          {/* Backlog shows count inline */}
          {isBacklog && (
            <span className={s.backlogCount}>
              {doneTasks}/{totalTasks}
            </span>
          )}

          {/* Run button: only when idle (open status) with tasks */}
          {!isBacklog && canRunAi && onRunWorkstream && wsStatus === 'open' && totalTasks > 0 && (
            <button
              className={s.runBtn}
              onClick={onRunWorkstream}
              title="Run workstream"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Run
            </button>
          )}

          {/* Add/rename/delete buttons: only before work starts */}
          {(isBacklog || wsStatus === 'open' || !wsStatus) && (
            <>
              <button
                className={s.addBtn}
                onClick={onAddTask}
                title="Add task"
              >
                +
              </button>

              {!isBacklog && workstream && onDeleteWorkstream && (
                <button
                  className={`${s.actionBtn} ${s.actionBtnDanger}`}
                  onClick={async () => {
                    if (await modal.confirm('Delete workstream', `Delete workstream "${workstream.name}"? Tasks will move to backlog.`, { label: 'Delete', danger: true })) {
                      onDeleteWorkstream(workstream.id);
                    }
                  }}
                  title="Delete workstream"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>

        {/* Progress line on the separator — full width, colored by state */}
        {!isBacklog && totalTasks > 0 && (
          <div className={s.progressLine}>
            <div
              className={`${s.progressLineFill} ${wsStatus ? s[`progressLine--${wsStatus.replace(' ', '-')}`] : ''}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </div>

      {/* Task list */}
      <div
        className={s.tasks}
        ref={tasksRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (draggedTaskId) updateDropIndicator(e.clientY);
        }}
      >
        {tasks.length === 0 && draggedTaskId && (
          <div className={s.emptyDropZone}>Drop here</div>
        )}
        {tasks.length === 0 && !draggedTaskId && (
          <div className={s.empty}>
            {isBacklog ? 'No tasks in backlog' : 'Drop tasks here'}
          </div>
        )}
        {tasks.map((task) => {
          const job = taskJobMap[task.id] || null;
          return (
            <div key={task.id} className={s.cardWrap}>
              <TaskCard
                task={task}
                job={job}
                canRunAi={canRunAi}
                showPriority={isBacklog}
                projectId={projectId || undefined}
                isExpanded={expandedIds.has(task.id)}
                onToggleExpand={() => setExpandedIds(prev => {
                  const next = new Set(prev);
                  if (next.has(task.id)) next.delete(task.id);
                  else next.add(task.id);
                  return next;
                })}
                onRun={isBacklog ? undefined : onRunTask}
                onEdit={onEditTask ? () => onEditTask(task) : undefined}
                onDelete={onDeleteTask ? () => onDeleteTask(task.id) : undefined}
                onUpdateTask={onUpdateTask}
                onTerminate={onTerminate}
                onReply={onReply}
                onApprove={onApprove}
                onReject={onReject}
                onRevert={onRevert}
                onDeleteJob={onDeleteJob}
                onDragStart={() => onDragTaskStart(task.id)}
                onDragEnd={onDragTaskEnd}
                isDragging={draggedTaskId === task.id}
                dragDisabled={dragDisabled}
              />
            </div>
          );
        })}
      </div>

      {allDone && !isBacklog && wsStatus === 'pending review' && (
        <div className={s.completeBanner}>
          <span>&#10003; All tasks complete</span>
          {onCreatePr && (
            <button className="btn btnPrimary btnSm" onClick={onCreatePr}>Review &amp; Create PR</button>
          )}
        </div>
      )}

      {wsStatus === 'reviewing' && (
        <div className={`${s.completeBanner} ${s.reviewingBanner}`}>
          <span className={s.reviewingLabel}>
            <span className={s.reviewingDot} />
            Reviewing code...
          </span>
        </div>
      )}

      {wsStatus === 'review failed' && (
        <div className={`${s.completeBanner} ${s.failedBanner}`}>
          <span>Review failed</span>
          {onCreatePr && (
            <button className="btn btnDanger btnSm" onClick={onCreatePr}>Retry</button>
          )}
        </div>
      )}

      {(wsStatus === 'done' || wsStatus === 'merged') && (
        <div className={s.completeBanner}>
          <span>&#10003; PR created</span>
          <div className={s.completeBannerActions}>
            {workstream?.pr_url && (
              <a href={workstream.pr_url} target="_blank" rel="noopener noreferrer" className={s.prLink}>
                View PR
              </a>
            )}
            {onArchive && (
              <button className={s.archiveBtn} onClick={onArchive}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
