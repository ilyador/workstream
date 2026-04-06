import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useModal } from '../hooks/useModal';
import { TaskCard } from './TaskCard';
import { ArtifactConnector } from './ArtifactConnector';
import type { JobView } from './job-types';
import s from './WorkstreamColumn.module.css';
import taskStyles from './TaskCard.module.css';

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

interface Workstream {
  id: string;
  name: string;
  description?: string;
  has_code?: boolean;
  status: string;
  position: number;
  pr_url?: string | null;
  reviewer_id?: string | null;
  review_output?: string | null;
}

interface WorkstreamColumnProps {
  workstream: Workstream | null;
  tasks: Task[];
  taskJobMap: Record<string, JobView>;
  isBacklog: boolean;
  canRunAi: boolean;
  projectId: string | null;
  members?: Array<{ id: string; name: string; initials: string }>;
  mentionedTaskIds: Set<string>;
  commentCounts?: Record<string, number>;
  focusTaskId: string | null;
  focusWsId?: string | null;
  // Task drag
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  onDragTaskStart: (taskId: string) => void;
  onDragGroupStart?: (taskIds: string[]) => void;
  onDragTaskEnd: () => void;
  onDropTask: (workstreamId: string | null, dropBeforeTaskId: string | null) => void;
  // Column drag
  draggedWsId?: string | null;
  onColumnDragStart?: (wsId: string) => void;
  onColumnDrop?: (targetWsId: string) => void;
  // Column actions
  onRenameWorkstream?: (id: string, name: string) => void;
  onDeleteWorkstream?: (id: string) => void;
  onUpdateWorkstream?: (id: string, data: Record<string, unknown>) => Promise<void>;
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
  onRework?: (jobId: string, note: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  onContinue?: (jobId: string) => void;
  onCreatePr?: () => void;
  onArchive?: () => void;
  currentUserId?: string;
  metaItems?: (taskId: string) => { label: string; value: string }[] | undefined;
  hideComments?: boolean;
  listHeader?: React.ReactNode;
  headerExtra?: React.ReactNode;
}

export function WorkstreamColumn({
  workstream,
  tasks,
  taskJobMap,
  isBacklog,
  canRunAi,
  projectId,
  members,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  draggedTaskId,
  draggedGroupIds,
  onDragTaskStart,
  onDragGroupStart,
  onDragTaskEnd,
  onDropTask,
  draggedWsId,
  onColumnDragStart,
  onColumnDrop,
  onRenameWorkstream,
  onDeleteWorkstream,
  onUpdateWorkstream,
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
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
  onArchive,
  currentUserId,
  metaItems,
  hideComments,
  listHeader,
  headerExtra,
}: WorkstreamColumnProps) {
  const modal = useModal();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(workstream?.name || '');
  const [columnDropSide, setColumnDropSide] = useState<'left' | 'right' | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const dropIndexRef = useRef<string | null>(null);
  const dragCountRef = useRef(0); // track enter/leave balance to handle child elements
  const colDragCountRef = useRef(0);
  const columnScrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const groupGhostRef = useRef<HTMLElement | null>(null);

  // Detect chains: consecutive tasks where prev produces and current accepts
  const chainGroups = useMemo(() => {
    const groups: Array<{ taskIds: string[]; startIndex: number }> = [];
    let i = 0;
    while (i < tasks.length) {
      if (i > 0) {
        const prev = tasks[i - 1];
        const task = tasks[i];
        const prevProduces = prev.chaining === 'produce' || prev.chaining === 'both';
        const currentAccepts = task.chaining === 'accept' || task.chaining === 'both';
        if (prevProduces && currentAccepts) {
          const lastGroup = groups[groups.length - 1];
          if (lastGroup && lastGroup.taskIds.includes(prev.id)) {
            lastGroup.taskIds.push(task.id);
          } else {
            groups.push({ taskIds: [prev.id, task.id], startIndex: i - 1 });
          }
          i++;
          continue;
        }
      }
      i++;
    }
    return groups;
  }, [tasks]);

  // Helper: find which chain group a task belongs to
  const getChainGroup = useCallback((taskId: string) => {
    return chainGroups.find(g => g.taskIds.includes(taskId)) || null;
  }, [chainGroups]);

  // Freeze line: index of last task with a non-default status (touched tasks are locked)
  const UNTOUCHED_STATUSES = new Set(['backlog', 'todo']);
  const freezeIndex = useMemo(() => {
    let lastTouched = -1;
    for (let i = 0; i < tasks.length; i++) {
      if (!UNTOUCHED_STATUSES.has(tasks[i].status || 'backlog')) lastTouched = i;
    }
    return lastTouched;
  }, [tasks]);

  // Detect broken chaining links (unmet produce/accept with no matching neighbor)
  const brokenLinks = useMemo(() => {
    if (isBacklog) return new Map<string, { up: boolean; down: boolean }>();
    const map = new Map<string, { up: boolean; down: boolean }>();
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const accepts = task.chaining === 'accept' || task.chaining === 'both';
      const produces = task.chaining === 'produce' || task.chaining === 'both';
      if (!accepts && !produces) continue;
      const prev = i > 0 ? tasks[i - 1] : null;
      const next = i < tasks.length - 1 ? tasks[i + 1] : null;
      const up = accepts && !(prev && (prev.chaining === 'produce' || prev.chaining === 'both'));
      const down = produces && !(next && (next.chaining === 'accept' || next.chaining === 'both'));
      if (up || down) map.set(task.id, { up, down });
    }
    return map;
  }, [tasks, isBacklog]);

  const hasBrokenLinks = brokenLinks.size > 0;

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
    if (dbStatus === 'merged' || dbStatus === 'archived') return 'merged' as const;
    if (totalTasks === 0) return 'open' as const;
    const hasRunningTask = tasks.some(t => {
      const job = taskJobMap[t.id];
      if (job && ['queued', 'running', 'paused'].includes(job.status)) return true;
      if (t.mode === 'human' && t.status === 'in_progress') return true;
      return false;
    });
    if (hasRunningTask) return 'in progress' as const;
    const hasPendingApproval = tasks.some(t => {
      const job = taskJobMap[t.id];
      return job && job.status === 'review';
    });
    if (hasPendingApproval) return 'pending review' as const;
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
  const dragDisabledGlobal = !isBacklog && activeAiJobId !== null;

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

  // Focus a task from ?task= URL param: expand, scroll into view, highlight
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTaskId || focusedRef.current === focusTaskId) return;
    const match = tasks.find(t => t.id === focusTaskId);
    if (!match) return;
    focusedRef.current = focusTaskId;
    // Expand the card
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.add(focusTaskId);
      return next;
    });
    // Scroll into view and apply highlight after a tick (DOM needs to update)
    const rafId = requestAnimationFrame(() => {
      const container = tasksRef.current;
      if (!container) return;
      const wraps = Array.from(container.querySelectorAll<HTMLElement>(`.${s.cardWrap}`));
      const idx = tasks.findIndex(t => t.id === focusTaskId);
      const el = wraps[idx];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const card = el.querySelector<HTMLElement>(`.${taskStyles.card}`);
      if (card) {
        card.classList.add(taskStyles.highlight);
        card.addEventListener('animationend', () => card.classList.remove(taskStyles.highlight), { once: true });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [focusTaskId, tasks]);

  // Focus workstream from ?ws= URL param: scroll into view, highlight column
  const focusedWsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusWsId || !workstream || workstream.id !== focusWsId || focusedWsRef.current === focusWsId) return;
    focusedWsRef.current = focusWsId;
    const col = columnRef.current;
    if (!col) return;
    col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    col.classList.add(s.columnHighlight);
    col.addEventListener('animationend', () => col.classList.remove(s.columnHighlight), { once: true });
  }, [focusWsId, workstream]);

  // Clean up column scroll interval and group ghost on unmount
  useEffect(() => () => {
    if (columnScrollInterval.current) clearInterval(columnScrollInterval.current);
    groupGhostRef.current?.remove();
  }, []);

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
    clearDropIndicator();

    // IDs being dragged (single task or entire group)
    const draggedIds = new Set(draggedGroupIds && draggedGroupIds.length > 0 ? draggedGroupIds : [draggedTaskId]);

    // Build list of drop targets: each is either a single cardWrap or a chainGroup
    const targets: Array<{ element: HTMLElement; taskId: string; isGroup: boolean }> = [];

    // Collect chain groups (not being dragged)
    const groupedTaskIds = new Set<string>();
    const groups = container.querySelectorAll<HTMLElement>(`.${s.chainGroup}`);
    groups.forEach(g => {
      const ids = (g.dataset.groupIds || '').split(',');
      if (ids.some(id => draggedIds.has(id))) return; // skip dragged group
      ids.forEach(id => groupedTaskIds.add(id));
      targets.push({ element: g, taskId: ids[0], isGroup: true });
    });

    // Collect individual cardWraps (not in a group, not being dragged)
    const wraps = container.querySelectorAll<HTMLElement>(`.${s.cardWrap}`);
    wraps.forEach(w => {
      const tid = w.dataset.taskId || '';
      if (draggedIds.has(tid) || groupedTaskIds.has(tid)) return;
      targets.push({ element: w, taskId: tid, isGroup: false });
    });

    // Sort by DOM order (top position)
    targets.sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);

    // Find drop target
    let dropBeforeTaskId: string | null = null;
    for (const target of targets) {
      const rect = target.element.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        dropBeforeTaskId = target.taskId;
        break;
      }
    }

    dropIndexRef.current = dropBeforeTaskId;

    // Show indicator
    if (dropBeforeTaskId) {
      const targetEl = targets.find(t => t.taskId === dropBeforeTaskId);
      if (targetEl) {
        if (targetEl.isGroup) {
          // Show indicator above the first cardWrap inside the group
          const firstWrap = targetEl.element.querySelector<HTMLElement>(`.${s.cardWrap}`);
          firstWrap?.classList.add(s.dropBefore);
        } else {
          targetEl.element.classList.add(s.dropBefore);
        }
      }
    } else if (targets.length > 0) {
      const last = targets[targets.length - 1];
      if (last.isGroup) {
        const lastWraps = last.element.querySelectorAll<HTMLElement>(`.${s.cardWrap}`);
        lastWraps[lastWraps.length - 1]?.classList.add(s.dropAfter);
      } else {
        last.element.classList.add(s.dropAfter);
      }
    }
  }, [draggedTaskId, draggedGroupIds, clearDropIndicator]);

  const clearColumnScroll = useCallback(() => {
    if (columnScrollInterval.current) {
      clearInterval(columnScrollInterval.current);
      columnScrollInterval.current = null;
    }
  }, []);

  // Column drag-over: detect which side the cursor is on for the drop indicator
  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    if (!draggedWsId || !workstream || draggedWsId === workstream.id) return;
    const col = columnRef.current;
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    setColumnDropSide(e.clientX < midX ? 'left' : 'right');
  }, [draggedWsId, workstream]);

  const showDropLeft = !isBacklog && draggedWsId && workstream && draggedWsId !== workstream.id && columnDropSide === 'left';
  const showDropRight = !isBacklog && draggedWsId && workstream && draggedWsId !== workstream.id && columnDropSide === 'right';

  const renderReviewer = () => {
    if (!workstream || !members || members.length === 0 || !onUpdateWorkstream) return null;
    if (workstream.reviewer_id) {
      const reviewer = members.find(m => m.id === workstream.reviewer_id);
      return reviewer ? (
        <span className={s.reviewerChip}>
          <span className={s.reviewerAvatar}>{reviewer.initials}</span>
          {reviewer.name}
        </span>
      ) : null;
    }
    return (
      <select
        className={s.reviewerSelect}
        defaultValue=""
        onChange={async e => {
          if (e.target.value) {
            try {
              await onUpdateWorkstream(workstream.id, { reviewer_id: e.target.value });
            } catch (err) {
              console.error('Failed to assign reviewer:', err);
            }
          }
        }}
      >
        <option value="">Assign reviewer</option>
        {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  };

  return (
    <div className={s.columnOuter}>
      {showDropLeft && <div className={s.columnDropLine} />}
    <div
      ref={columnRef}
      className={`${s.column} ${isBacklog ? s.backlog : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (draggedTaskId) {
          dragCountRef.current++;
        }
        if (draggedWsId && workstream && draggedWsId !== workstream.id) {
          colDragCountRef.current++;
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (draggedWsId) handleColumnDragOver(e);
      }}
      onDragLeave={() => {
        if (draggedTaskId) {
          dragCountRef.current--;
          if (dragCountRef.current <= 0) {
            dragCountRef.current = 0;
            clearDropIndicator();
            clearColumnScroll();
            dropIndexRef.current = null;
          }
        }
        if (draggedWsId && workstream) {
          colDragCountRef.current--;
          if (colDragCountRef.current <= 0) {
            colDragCountRef.current = 0;
            setColumnDropSide(null);
          }
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        clearColumnScroll();
        // Handle task drop (null = drop at end, which also handles empty columns)
        if (draggedTaskId) {
          clearDropIndicator();
          dragCountRef.current = 0;
          onDropTask(wsId, dropIndexRef.current);
          dropIndexRef.current = null;
        }
        // Handle column drop
        if (draggedWsId && workstream && onColumnDrop && draggedWsId !== workstream.id) {
          colDragCountRef.current = 0;
          setColumnDropSide(null);
          onColumnDrop(workstream.id);
        }
      }}
    >
      {/* Header */}
      <div className={s.headerWrap}>
        <div className={s.header}>
          <div className={s.headerLeft}>
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
                draggable={!isBacklog && !!onColumnDragStart && !!workstream}
                onDragStart={(e) => {
                  if (isBacklog || !workstream || !onColumnDragStart) return;
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', workstream.id);
                  const ghost = document.createElement('div');
                  ghost.textContent = workstream.name;
                  ghost.style.cssText = `
                    padding: 8px 16px;
                    background: var(--white, #fff);
                    color: var(--text, #1a1a1a);
                    font-family: 'Instrument Sans', system-ui, sans-serif;
                    font-size: 13px;
                    font-weight: 600;
                    border-radius: 8px;
                    border: 1.5px solid rgba(37, 99, 235, 0.3);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
                    position: fixed; top: -999px; left: -999px;
                    pointer-events: none;
                    white-space: nowrap;
                  `;
                  ghost.id = '__column-drag-preview__';
                  document.body.appendChild(ghost);
                  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
                  onColumnDragStart(workstream.id);
                  e.stopPropagation();
                }}
                onDragEnd={() => {
                  document.getElementById('__column-drag-preview__')?.remove();
                }}
                onDoubleClick={() => {
                  if (!isBacklog && workstream) {
                    setEditName(workstream.name);
                    setEditing(true);
                  }
                }}
                title={isBacklog ? undefined : 'Drag to reorder, double-click to rename'}
                style={!isBacklog && onColumnDragStart ? { cursor: 'grab' } : undefined}
              >
                {isBacklog ? 'Backlog' : workstream?.name}
              </span>
            )}

            {!isBacklog && totalTasks > 0 && wsStatus && wsStatus !== 'open' && (
              <span className={`${s.statusPill} ${s[`statusPill--${wsStatus.replace(' ', '-')}`] || ''}`}>
                {wsStatus}
              </span>
            )}

            {headerExtra}
          </div>

          <div className={s.headerRight}>
            {!isBacklog && canRunAi && onRunWorkstream && wsStatus === 'open' && totalTasks > 0 && !hasBrokenLinks && (
              <button
                className={s.runBtn}
                onClick={onRunWorkstream}
                title="Run workstream"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Run
              </button>
            )}

            <button
              className={s.addBtn}
              onClick={onAddTask}
              title="Add task"
            >
              +
            </button>

            {!headerExtra && totalTasks > 0 && (
              <span className={s.taskCount}>
                {isBacklog ? totalTasks : `${doneTasks}/${totalTasks}`}
              </span>
            )}

            {(isBacklog || wsStatus === 'open' || !wsStatus) && !isBacklog && workstream && onDeleteWorkstream && (
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
          </div>
        </div>

        {/* Progress line on the separator -- full width, colored by state (hidden when headerExtra) */}
        {!headerExtra && !isBacklog && totalTasks > 0 && (
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
          if (draggedTaskId) {
            updateDropIndicator(e.clientY);

            // Vertical auto-scroll when dragging near top/bottom edges
            const container = tasksRef.current;
            if (container) {
              const rect = container.getBoundingClientRect();
              const edgeZone = 50;
              const scrollSpeed = 8;
              if (e.clientY < rect.top + edgeZone) {
                if (!columnScrollInterval.current) {
                  columnScrollInterval.current = setInterval(() => {
                    container.scrollTop -= scrollSpeed;
                  }, 16);
                }
              } else if (e.clientY > rect.bottom - edgeZone) {
                if (!columnScrollInterval.current) {
                  columnScrollInterval.current = setInterval(() => {
                    container.scrollTop += scrollSpeed;
                  }, 16);
                }
              } else {
                clearColumnScroll();
              }
            }
          }
        }}
        onDragLeave={() => {
          clearColumnScroll();
        }}
      >
        {listHeader}
        {tasks.length === 0 && draggedTaskId && (
          <div className={s.emptyDropZone}>Drop here</div>
        )}
        {tasks.length === 0 && !draggedTaskId && (
          <div className={s.empty}>
            {isBacklog ? 'No tasks in backlog' : 'Drop tasks here'}
          </div>
        )}
        {(() => {
          const rendered = new Set<string>();
          return tasks.map((task, index) => {
            if (rendered.has(task.id)) return null;

            const group = getChainGroup(task.id);
            if (group && index === group.startIndex) {
              // Render entire chain group
              const groupTasks = group.taskIds.map(id => tasks.find(t => t.id === id)!);
              const isGroupDragging = draggedGroupIds ? group.taskIds.some(id => draggedGroupIds.includes(id)) : false;
              group.taskIds.forEach(id => rendered.add(id));

              const handleGroupDragStart = (e?: React.DragEvent) => {
                if (e) {
                  // Find the chainGroup wrapper and clone it for the ghost
                  const chainGroupEl = (e.target as HTMLElement).closest(`.${s.chainGroup}`) as HTMLElement;
                  if (chainGroupEl) {
                    const clone = chainGroupEl.cloneNode(true) as HTMLElement;
                    clone.style.width = `${chainGroupEl.offsetWidth}px`;
                    clone.style.transform = 'rotate(2deg) scale(1.02)';
                    clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)';
                    clone.style.borderRadius = '10px';
                    clone.style.opacity = '0.92';
                    clone.style.position = 'fixed';
                    clone.style.top = '-9999px';
                    clone.style.left = '-9999px';
                    clone.style.pointerEvents = 'none';
                    clone.id = '__drag-preview__';
                    // Remove any existing ghost first
                    document.getElementById('__drag-preview__')?.remove();
                    document.body.appendChild(clone);
                    e.dataTransfer.setDragImage(clone, chainGroupEl.offsetWidth / 2, 20);
                    groupGhostRef.current = clone;
                  }
                }
                onDragGroupStart?.(group.taskIds);
              };

              const handleGroupDragEnd = () => {
                groupGhostRef.current?.remove();
                groupGhostRef.current = null;
                document.getElementById('__drag-preview__')?.remove();
                onDragTaskEnd();
              };

              return (
                <div
                  key={`chain-${group.taskIds[0]}`}
                  className={`${s.chainGroup} ${isGroupDragging ? s.chainGroupDragging : ''}`}
                  data-group-ids={group.taskIds.join(',')}
                >
                  {groupTasks.map((gt, gi) => {
                    const job = taskJobMap[gt.id] || null;
                    return (
                      <React.Fragment key={gt.id}>
                        {gi > 0 && <ArtifactConnector taskId={groupTasks[gi - 1].id} />}
                        <div className={s.cardWrap} data-task-id={gt.id}>
                          <TaskCard
                            task={gt}
                            job={job}
                            canRunAi={canRunAi}
                            showPriority={isBacklog}
                            projectId={projectId || undefined}
                            hasUnreadMention={mentionedTaskIds.has(gt.id)}
                            commentCount={commentCounts?.[gt.id] || 0}
                            brokenLink={brokenLinks.get(gt.id) || null}
                            prevTaskId={gi > 0 ? groupTasks[gi - 1].id : (index > 0 ? tasks[index - 1]?.id : null)}
                            isExpanded={expandedIds.has(gt.id)}
                            onToggleExpand={() => setExpandedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(gt.id)) next.delete(gt.id);
                              else next.add(gt.id);
                              return next;
                            })}
                            onRun={isBacklog || brokenLinks.has(gt.id) ? undefined : onRunTask}
                            onEdit={onEditTask ? () => onEditTask(gt) : undefined}
                            onDelete={onDeleteTask && index > freezeIndex ? () => onDeleteTask(gt.id) : undefined}
                            onUpdateTask={onUpdateTask}
                            onTerminate={onTerminate}
                            onReply={onReply}
                            onApprove={onApprove}
                            onReject={onReject}
                            onRework={onRework}
                            onDeleteJob={onDeleteJob}
                            onMoveToBacklog={onMoveToBacklog}
                    onContinue={onContinue}
                            onDragStart={handleGroupDragStart}
                            onDragEnd={handleGroupDragEnd}
                            isDragging={isGroupDragging}
                            dragDisabled={dragDisabledGlobal || index <= freezeIndex}
                            skipDragGhost
                            metaItems={metaItems?.(gt.id)}
                            hideComments={hideComments}
                          />
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            }

            if (group) return null; // Part of a group rendered at startIndex

            // Normal unchained task -- connector logic for non-chained tasks
            const prevTask = index > 0 ? tasks[index - 1] : null;
            const showConnector = prevTask && prevTask.status === 'done' &&
              task.chaining && ['accept', 'both'].includes(task.chaining) &&
              !getChainGroup(task.id);
            const job = taskJobMap[task.id] || null;
            return (
              <div key={task.id}>
                {showConnector && <ArtifactConnector taskId={prevTask.id} />}
                <div className={s.cardWrap} data-task-id={task.id}>
                  <TaskCard
                    task={task}
                    job={job}
                    canRunAi={canRunAi}
                    showPriority={isBacklog}
                    projectId={projectId || undefined}
                    hasUnreadMention={mentionedTaskIds.has(task.id)}
                    commentCount={commentCounts?.[task.id] || 0}
                    brokenLink={brokenLinks.get(task.id) || null}
                    prevTaskId={prevTask?.id || null}
                    isExpanded={expandedIds.has(task.id)}
                    onToggleExpand={() => setExpandedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(task.id)) next.delete(task.id);
                      else next.add(task.id);
                      return next;
                    })}
                    onRun={isBacklog || brokenLinks.has(task.id) ? undefined : onRunTask}
                    onEdit={onEditTask ? () => onEditTask(task) : undefined}
                    onDelete={onDeleteTask && index > freezeIndex ? () => onDeleteTask(task.id) : undefined}
                    onUpdateTask={onUpdateTask}
                    onTerminate={onTerminate}
                    onReply={onReply}
                    onApprove={onApprove}
                    onReject={onReject}
                    onRework={onRework}
                    onDeleteJob={onDeleteJob}
                    onMoveToBacklog={onMoveToBacklog}
                    onContinue={onContinue}
                    onDragStart={() => onDragTaskStart(task.id)}
                    onDragEnd={onDragTaskEnd}
                    isDragging={draggedTaskId === task.id}
                    dragDisabled={dragDisabledGlobal || index <= freezeIndex}
                    metaItems={metaItems?.(task.id)}
                    hideComments={hideComments}
                  />
                </div>
              </div>
            );
          });
        })()}
      </div>

      {allDone && !isBacklog && wsStatus === 'pending review' && (
        <div className={s.completeBanner}>
          <span>&#10003; All tasks complete</span>
          {workstream?.has_code !== false && onCreatePr && (
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
          <div>
            <span>Review failed</span>
            {workstream?.review_output && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{workstream.review_output}</div>
            )}
          </div>
          {onCreatePr && (
            <button className="btn btnDanger btnSm" onClick={onCreatePr}>Retry</button>
          )}
        </div>
      )}

      {wsStatus === 'done' && (
        <div className={`${s.completeBanner} ${s.doneBanner}`}>
          <div className={s.doneHeader}>
            <span className={s.doneLabel}>{workstream?.pr_url ? 'PR open' : '\u2713 Complete'}</span>
            <div className={s.completeBannerActions}>
              {workstream?.pr_url && renderReviewer()}
              {workstream?.pr_url && (
                <a href={workstream.pr_url} target="_blank" rel="noopener noreferrer" className={s.prLink}>
                  View PR
                </a>
              )}
            </div>
          </div>
          {workstream?.review_output && (
            <pre className={s.reviewOutput}>{workstream.review_output}</pre>
          )}
          {onCreatePr && (
            <div className={s.reviewActions}>
              <button className="btn btnWarning btnSm" onClick={onCreatePr}>
                {workstream?.pr_url ? 'Re-review & Fix' : 'Create PR'}
              </button>
            </div>
          )}
        </div>
      )}

      {wsStatus === 'merged' && (
        <div className={`${s.completeBanner} ${s.mergedBanner}`}>
          <span>&#10003; PR merged</span>
          <div className={s.completeBannerActions}>
            {renderReviewer()}
            {workstream?.pr_url && (
              <a href={workstream.pr_url} target="_blank" rel="noopener noreferrer" className={s.prLink}>
                View PR
              </a>
            )}
            {onArchive && currentUserId && workstream?.reviewer_id === currentUserId && (
              <button className={s.archiveBtn} onClick={onArchive}>
                Archive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
      {showDropRight && <div className={s.columnDropLine} />}
    </div>
  );
}
