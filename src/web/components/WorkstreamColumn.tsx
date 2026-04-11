import { useModal } from '../hooks/modal-context';
import { useWorkstreamColumnActions } from '../hooks/useWorkstreamColumnActions';
import { useWorkstreamColumnState } from '../hooks/useWorkstreamColumnState';
import { useWorkstreamColumnDrag } from '../hooks/useWorkstreamColumnDrag';
import { WorkstreamColumnHeader } from './WorkstreamColumnHeader';
import { WorkstreamColumnStatusBanners } from './WorkstreamColumnStatusBanners';
import { WorkstreamTaskList } from './WorkstreamTaskList';
import type { WorkstreamColumnProps } from './workstream-column-types';
import s from './WorkstreamColumn.module.css';

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
    containsAiTasks,
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
  const { handleStartEdit, handleRequestDelete, renderCard } = useWorkstreamColumnActions({
    workstream,
    onDeleteWorkstream,
    confirm: modal.confirm,
    setEditName,
    setEditing,
    renderTaskCard,
  });

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
        onStartEdit={handleStartEdit}
        onColumnDragStart={onColumnDragStart}
        canRunAi={canRunAi}
        onRunWorkstream={onRunWorkstream}
        wsStatus={wsStatus}
        totalTasks={totalTasks}
        containsAiTasks={containsAiTasks}
        doneTasks={doneTasks}
        hasBrokenLinks={hasBrokenLinks}
        headerExtra={headerExtra}
        onAddTask={onAddTask}
        onRequestDelete={workstream && onDeleteWorkstream ? handleRequestDelete : undefined}
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
