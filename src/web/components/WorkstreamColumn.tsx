import React from 'react';
import { useModal } from '../hooks/modal-context';
import { useWorkstreamColumnState } from '../hooks/useWorkstreamColumnState';
import { useWorkstreamColumnDrag } from '../hooks/useWorkstreamColumnDrag';
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
  const {
    columnScrollIntervalRef,
    updateDropIndicator,
    clearColumnScroll,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    showDropLeft,
    showDropRight,
  } = useWorkstreamColumnDrag({
    tasksRef,
    columnRef,
    workstreamId: wsId,
    draggedTaskId,
    draggedGroupIds,
    draggedWsId,
    isBacklog,
    onDropTask,
    onColumnDrop,
    classes: {
      chainGroup: s.chainGroup,
      cardWrap: s.cardWrap,
      dropBefore: s.dropBefore,
      dropAfter: s.dropAfter,
    },
  });

  const renderCard = (cardProps: TaskCardProps) => {
    if (renderTaskCard) return renderTaskCard(cardProps);
    return <TaskCard {...cardProps} />;
  };

  return (
    <div className={s.columnOuter}>
      {showDropLeft && <div className={s.columnDropLine} />}
    <div
      ref={columnRef}
      className={`${s.column} ${isBacklog ? s.backlog : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
        columnScrollIntervalRef={columnScrollIntervalRef}
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
