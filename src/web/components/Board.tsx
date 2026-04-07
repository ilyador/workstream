import { AddWorkstreamComposer } from './AddWorkstreamComposer';
import { BoardBacklogColumn } from './BoardBacklogColumn';
import { BoardWorkstreamColumns } from './BoardWorkstreamColumns';
import { useBoardDrag } from '../hooks/useBoardDrag';
import { useBoardColumns } from '../hooks/useBoardColumns';
import type { BoardProps } from './board-types';
import s from './Board.module.css';

export function Board({
  workstreams,
  tasks,
  jobs,
  memberMap,
  flowMap,
  typeFlowMap,
  userRole,
  projectId,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  onCreateWorkstream,
  onUpdateWorkstream,
  onDeleteWorkstream,
  onSwapColumns,
  onAddTask,
  onRunTask,
  onRunWorkstream,
  onEditTask,
  onDeleteTask,
  onUpdateTask,
  onMoveTask,
  onTerminate,
  onReply,
  onApprove,
  onReject,
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
  currentUserId,
}: BoardProps) {
  const {
    boardRef,
    draggedTaskId,
    setDraggedTaskId,
    draggedGroupIds,
    draggedWsId,
    setDraggedWsId,
    handleDragGroupStart,
    handleColumnDrop,
    handleDragEnd,
    handleBoardDragOver,
    isDragging,
  } = useBoardDrag({ onSwapColumns });
  const {
    taskJobMap,
    tasksByWorkstream,
    sortedWorkstreams,
    members,
    handleDropTask,
  } = useBoardColumns({
    workstreams,
    tasks,
    jobs,
    memberMap,
    flowMap,
    typeFlowMap,
    draggedTaskId,
    draggedGroupIds,
    onMoveTask,
    clearDraggedTask: () => setDraggedTaskId(null),
  });

  return (
    <div
      className={`${s.board} ${isDragging ? s.boardDragging : ''}`}
      ref={boardRef}
      onDragOver={handleBoardDragOver}
      data-board
    >
      <BoardBacklogColumn
        tasks={tasksByWorkstream.__backlog__ || []}
        taskJobMap={taskJobMap}
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        members={members}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        draggedTaskId={draggedTaskId}
        draggedGroupIds={draggedGroupIds}
        onDragTaskStart={setDraggedTaskId}
        onDragGroupStart={handleDragGroupStart}
        onDragTaskEnd={handleDragEnd}
        onDropTask={handleDropTask}
        onAddTask={() => onAddTask(null)}
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
        currentUserId={currentUserId}
      />

      <BoardWorkstreamColumns
        workstreams={sortedWorkstreams}
        tasksByWorkstream={tasksByWorkstream}
        taskJobMap={taskJobMap}
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        members={members}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        focusWsId={focusWsId}
        draggedTaskId={draggedTaskId}
        draggedGroupIds={draggedGroupIds}
        draggedWsId={draggedWsId}
        onDragTaskStart={setDraggedTaskId}
        onDragGroupStart={handleDragGroupStart}
        onDragTaskEnd={handleDragEnd}
        onDropTask={handleDropTask}
        onColumnDragStart={setDraggedWsId}
        onColumnDrop={handleColumnDrop}
        onUpdateWorkstream={onUpdateWorkstream}
        onDeleteWorkstream={onDeleteWorkstream}
        onAddTask={onAddTask}
        onRunWorkstream={onRunWorkstream}
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
        onCreatePr={onCreatePr}
        currentUserId={currentUserId}
      />

      <AddWorkstreamComposer onCreateWorkstream={onCreateWorkstream} />

    </div>
  );
}
