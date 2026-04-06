import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useModal } from '../hooks/modal-context';
import { TaskCard, type TaskCardProps } from './TaskCard';
import { ArtifactConnector } from './ArtifactConnector';
import { WorkstreamColumnHeader } from './WorkstreamColumnHeader';
import { WorkstreamColumnStatusBanners } from './WorkstreamColumnStatusBanners';
import type { JobView } from './job-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

const UNTOUCHED_STATUSES = new Set(['backlog', 'todo']);

interface WorkstreamColumnProps {
  workstream: WorkstreamView | null;
  tasks: TaskView[];
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
  onEditTask?: (task: TaskView) => void;
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
  onCreatePr?: (options?: { review?: boolean }) => void;
  onArchive?: () => void;
  currentUserId?: string;
  metaItems?: (taskId: string) => { label: string; value: string }[] | undefined;
  hideComments?: boolean;
  listHeader?: React.ReactNode;
  headerExtra?: React.ReactNode;
  renderTaskCard?: (props: TaskCardProps) => React.ReactNode;
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
  renderTaskCard,
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
    if (!activeTaskId || activeTaskId === prevActiveRef.current) return;
    const frameId = requestAnimationFrame(() => {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(activeTaskId);
        return next;
      });
    });
    prevActiveRef.current = activeTaskId;
    return () => cancelAnimationFrame(frameId);
  }, [activeTaskId]);

  // Focus a task from ?task= URL param: expand, scroll into view, highlight
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTaskId || focusedRef.current === focusTaskId) return;
    const match = tasks.find(t => t.id === focusTaskId);
    if (!match) return;
    focusedRef.current = focusTaskId;
    // Scroll into view and apply highlight after a tick (DOM needs to update)
    const rafId = requestAnimationFrame(() => {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(focusTaskId);
        return next;
      });
      const container = tasksRef.current;
      if (!container) return;
      const wraps = Array.from(container.querySelectorAll<HTMLElement>(`.${s.cardWrap}`));
      const idx = tasks.findIndex(t => t.id === focusTaskId);
      const el = wraps[idx];
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const card = el.querySelector<HTMLElement>('[data-task-card="true"]');
      if (card) {
        card.classList.add(s.cardHighlight);
        card.addEventListener('animationend', () => card.classList.remove(s.cardHighlight), { once: true });
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
    document.getElementById('__drag-preview__')?.remove();
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

  const renderCard = (cardProps: WorkstreamTaskCardProps) => {
    if (renderTaskCard) return renderTaskCard(cardProps);
    return <TaskCard {...cardProps} />;
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
      <WorkstreamColumnHeader
        workstream={workstream}
        isBacklog={isBacklog}
        editing={editing}
        editName={editName}
        nameInputRef={nameInputRef}
        onEditNameChange={setEditName}
        onRename={handleRename}
        onCancelEdit={() => setEditing(false)}
        onStartEdit={() => {
          if (!workstream) return;
          setEditName(workstream.name);
          setEditing(true);
        }}
        onColumnDragStart={onColumnDragStart}
        canRunAi={canRunAi}
        onRunWorkstream={onRunWorkstream}
        wsStatus={wsStatus}
        totalTasks={totalTasks}
        doneTasks={doneTasks}
        hasBrokenLinks={hasBrokenLinks}
        headerExtra={headerExtra}
        onAddTask={onAddTask}
        onRequestDelete={workstream && onDeleteWorkstream ? async () => {
          if (await modal.confirm('Delete workstream', `Delete workstream "${workstream.name}"? Tasks will move to backlog.`, { label: 'Delete', danger: true })) {
            onDeleteWorkstream(workstream.id);
          }
        } : undefined}
        progressPct={progressPct}
      />

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
                  }
                }
                onDragGroupStart?.(group.taskIds);
              };

              const handleGroupDragEnd = () => {
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
                        {gi > 0 && <ArtifactConnector taskId={groupTasks[gi - 1].id} projectId={projectId || undefined} />}
                        <div className={s.cardWrap} data-task-id={gt.id}>
                          {renderCard({
                            task: gt,
                            job,
                            canRunAi,
                            isBacklog,
                            showPriority: isBacklog,
    projectId: projectId || undefined,
    mentionMembers: members,
    hasUnreadMention: mentionedTaskIds.has(gt.id),
                            commentCount: commentCounts?.[gt.id] || 0,
                            brokenLink: brokenLinks.get(gt.id) || null,
                            prevTaskId: gi > 0 ? groupTasks[gi - 1].id : (index > 0 ? tasks[index - 1]?.id : null),
                            isExpanded: expandedIds.has(gt.id),
                            onToggleExpand: () => setExpandedIds(prev => {
                              const next = new Set(prev);
                              if (next.has(gt.id)) next.delete(gt.id);
                              else next.add(gt.id);
                              return next;
                            }),
                            onRun: isBacklog || brokenLinks.has(gt.id) ? undefined : onRunTask,
                            onEdit: onEditTask ? () => onEditTask(gt) : undefined,
                            onDelete: onDeleteTask && index > freezeIndex ? () => onDeleteTask(gt.id) : undefined,
                            onUpdateTask,
                            onTerminate,
                            onReply,
                            onApprove,
                            onReject,
                            onRework,
                            onDeleteJob,
                            onMoveToBacklog,
                            onContinue,
                            onDragStart: handleGroupDragStart,
                            onDragEnd: handleGroupDragEnd,
                            isDragging: isGroupDragging,
                            dragDisabled: dragDisabledGlobal || index <= freezeIndex,
                            skipDragGhost: true,
                            metaItems: metaItems?.(gt.id),
                            hideComments,
                          })}
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
                {showConnector && <ArtifactConnector taskId={prevTask.id} projectId={projectId || undefined} />}
                <div className={s.cardWrap} data-task-id={task.id}>
                  {renderCard({
                    task,
                    job,
                    canRunAi,
                    isBacklog,
                    showPriority: isBacklog,
                    projectId: projectId || undefined,
                    mentionMembers: members,
                    hasUnreadMention: mentionedTaskIds.has(task.id),
                    commentCount: commentCounts?.[task.id] || 0,
                    brokenLink: brokenLinks.get(task.id) || null,
                    prevTaskId: prevTask?.id || null,
                    isExpanded: expandedIds.has(task.id),
                    onToggleExpand: () => setExpandedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(task.id)) next.delete(task.id);
                      else next.add(task.id);
                      return next;
                    }),
                    onRun: isBacklog || brokenLinks.has(task.id) ? undefined : onRunTask,
                    onEdit: onEditTask ? () => onEditTask(task) : undefined,
                    onDelete: onDeleteTask && index > freezeIndex ? () => onDeleteTask(task.id) : undefined,
                    onUpdateTask,
                    onTerminate,
                    onReply,
                    onApprove,
                    onReject,
                    onRework,
                    onDeleteJob,
                    onMoveToBacklog,
                    onContinue,
                    onDragStart: () => onDragTaskStart(task.id),
                    onDragEnd: onDragTaskEnd,
                    isDragging: draggedTaskId === task.id,
                    dragDisabled: dragDisabledGlobal || index <= freezeIndex,
                    metaItems: metaItems?.(task.id),
                    hideComments,
                  })}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <WorkstreamColumnStatusBanners
        workstream={workstream}
        wsStatus={wsStatus}
        allDone={allDone}
        isBacklog={isBacklog}
        onCreatePr={onCreatePr}
        onArchive={onArchive}
        currentUserId={currentUserId}
        members={members}
        onUpdateWorkstream={onUpdateWorkstream}
      />
    </div>
      {showDropRight && <div className={s.columnDropLine} />}
    </div>
  );
}
