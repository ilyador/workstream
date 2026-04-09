import { AddWorkstreamComposer } from './AddWorkstreamComposer';
import { BoardBacklogColumn } from './BoardBacklogColumn';
import { BoardWorkstreamColumns } from './BoardWorkstreamColumns';
import { useBoardDrag } from '../hooks/useBoardDrag';
import { useBoardColumns } from '../hooks/useBoardColumns';
import type { BoardProps } from './board-types';
import type { RelativeDropSide } from '../lib/optimistic-updates';
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
  } = useBoardDrag({ onSwapColumns: handleMoveColumnsWithinSection });
  const {
    taskJobMap,
    tasksByWorkstream,
    activeWorkstreams,
    completeWorkstreams,
    workstreamSectionById,
    taskSectionById,
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
  function handleMoveColumnsWithinSection(
    draggedId: string,
    targetId: string,
    side: RelativeDropSide,
  ) {
    const draggedSection = workstreamSectionById[draggedId];
    const targetSection = workstreamSectionById[targetId];
    if (!draggedSection || draggedSection !== targetSection) return;

    const orderedIds = (draggedSection === 'complete' ? completeWorkstreams : activeWorkstreams)
      .map(workstream => workstream.id);
    onSwapColumns(draggedId, targetId, side, orderedIds);
  }
  const draggedWorkstreamSection = draggedWsId ? workstreamSectionById[draggedWsId] : null;
  const draggedTaskSection = draggedTaskId ? taskSectionById[draggedTaskId] || 'active' : null;

  const handleColumnDropWithinSection = (targetWorkstreamId: string, side: RelativeDropSide) => {
    if (!draggedWsId) return;
    if (workstreamSectionById[draggedWsId] !== workstreamSectionById[targetWorkstreamId]) {
      setDraggedWsId(null);
      return;
    }
    handleColumnDrop(targetWorkstreamId, side);
  };

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
        draggedTaskId={draggedTaskSection === 'active' ? draggedTaskId : null}
        draggedGroupIds={draggedTaskSection === 'active' ? draggedGroupIds : []}
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
        workstreams={activeWorkstreams}
        tasksByWorkstream={tasksByWorkstream}
        taskJobMap={taskJobMap}
        canRunAi={userRole !== 'manager'}
        projectId={projectId}
        members={members}
        mentionedTaskIds={mentionedTaskIds}
        commentCounts={commentCounts}
        focusTaskId={focusTaskId}
        focusWsId={focusWsId}
        draggedTaskId={draggedTaskSection === 'active' ? draggedTaskId : null}
        draggedGroupIds={draggedTaskSection === 'active' ? draggedGroupIds : []}
        draggedWsId={draggedWorkstreamSection === 'active' ? draggedWsId : null}
        onDragTaskStart={setDraggedTaskId}
        onDragGroupStart={handleDragGroupStart}
        onDragTaskEnd={handleDragEnd}
        onDropTask={handleDropTask}
        onColumnDragStart={setDraggedWsId}
        onColumnDrop={handleColumnDropWithinSection}
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

      {completeWorkstreams.length > 0 && (
        <div className={s.completeSeparator} aria-label="Completed streams">
          <span className={s.completeSeparatorLabel}>Complete</span>
        </div>
      )}

      {completeWorkstreams.length > 0 && (
        <BoardWorkstreamColumns
          workstreams={completeWorkstreams}
          tasksByWorkstream={tasksByWorkstream}
          taskJobMap={taskJobMap}
          canRunAi={userRole !== 'manager'}
          projectId={projectId}
          members={members}
          mentionedTaskIds={mentionedTaskIds}
          commentCounts={commentCounts}
          focusTaskId={focusTaskId}
          focusWsId={focusWsId}
          draggedTaskId={draggedTaskSection === 'complete' ? draggedTaskId : null}
          draggedGroupIds={draggedTaskSection === 'complete' ? draggedGroupIds : []}
          draggedWsId={draggedWorkstreamSection === 'complete' ? draggedWsId : null}
          onDragTaskStart={setDraggedTaskId}
          onDragGroupStart={handleDragGroupStart}
          onDragTaskEnd={handleDragEnd}
          onDropTask={handleDropTask}
          onColumnDragStart={setDraggedWsId}
          onColumnDrop={handleColumnDropWithinSection}
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
      )}

    </div>
  );
}
