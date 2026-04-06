import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useModal } from '../hooks/modal-context';
import { useWorkstreamColumnState } from '../hooks/useWorkstreamColumnState';
import { TaskCard, type TaskCardProps } from './TaskCard';
import { WorkstreamColumnHeader } from './WorkstreamColumnHeader';
import { WorkstreamColumnStatusBanners } from './WorkstreamColumnStatusBanners';
import { WorkstreamTaskList } from './WorkstreamTaskList';
import type { JobView } from './job-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

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
  const [columnDropSide, setColumnDropSide] = useState<'left' | 'right' | null>(null);
  const dropIndexRef = useRef<string | null>(null);
  const dragCountRef = useRef(0); // track enter/leave balance to handle child elements
  const colDragCountRef = useRef(0);
  const columnScrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    expandedIds,
    setExpandedIds,
    editing,
    setEditing,
    editName,
    setEditName,
    nameInputRef,
    tasksRef,
    columnRef,
    chainGroups,
    getChainGroup,
    freezeIndex,
    brokenLinks,
    hasBrokenLinks,
    wsId,
    doneTasks,
    totalTasks,
    allDone,
    progressPct,
    wsStatus,
    dragDisabledGlobal,
    handleRename,
  } = useWorkstreamColumnState({
    workstream,
    tasks,
    taskJobMap,
    isBacklog,
    focusTaskId,
    focusWsId,
    onRenameWorkstream,
    classes: {
      cardWrap: s.cardWrap,
      cardHighlight: s.cardHighlight,
      columnHighlight: s.columnHighlight,
    },
  });

  // Clean up column scroll interval and group ghost on unmount
  useEffect(() => () => {
    if (columnScrollInterval.current) clearInterval(columnScrollInterval.current);
    document.getElementById('__drag-preview__')?.remove();
  }, []);

  const renderCard = (cardProps: TaskCardProps) => {
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
  }, [tasksRef]);

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
  }, [draggedTaskId, draggedGroupIds, clearDropIndicator, tasksRef]);

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
  }, [draggedWsId, workstream, columnRef]);

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

      <WorkstreamTaskList
        tasks={tasks}
        taskJobMap={taskJobMap}
        isBacklog={isBacklog}
        canRunAi={canRunAi}
        projectId={projectId}
        members={members}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        draggedTaskId={draggedTaskId}
        draggedGroupIds={draggedGroupIds}
        expandedIds={expandedIds}
        setExpandedIds={setExpandedIds}
        freezeIndex={freezeIndex}
        dragDisabledGlobal={dragDisabledGlobal}
        brokenLinks={brokenLinks}
        chainGroups={chainGroups}
        getChainGroup={getChainGroup}
        onDragTaskStart={onDragTaskStart}
        onDragGroupStart={onDragGroupStart}
        onDragTaskEnd={onDragTaskEnd}
        onRunTask={onRunTask}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
        onUpdateTask={onUpdateTask}
        onTerminate={onTerminate}
        onReply={onReply}
        onApprove={onApprove}
        onReject={onReject}
        onRework={onRework}
        onDeleteJob={onDeleteJob}
        onMoveToBacklog={onMoveToBacklog}
        onContinue={onContinue}
        metaItems={metaItems}
        hideComments={hideComments}
        listHeader={listHeader}
        renderCard={renderCard}
        tasksRef={tasksRef}
        columnScrollIntervalRef={columnScrollInterval}
        updateDropIndicator={updateDropIndicator}
        clearColumnScroll={clearColumnScroll}
      />

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
