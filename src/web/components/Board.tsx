import { WorkstreamColumn } from './WorkstreamColumn';
import { AddWorkstreamComposer } from './AddWorkstreamComposer';
import { useBoardDrag } from '../hooks/useBoardDrag';
import { useBoardColumns } from '../hooks/useBoardColumns';
import type { JobView } from './job-types';
import type { TaskRecord } from '../lib/api';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import s from './Board.module.css';

interface BoardProps {
  workstreams: WorkstreamView[];
  tasks: TaskRecord[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  typeFlowMap: Record<string, string>;
  userRole: string;
  projectId: string | null;
  mentionedTaskIds: Set<string>;
  commentCounts: Record<string, number>;
  focusTaskId: string | null;
  focusWsId?: string | null;
  // Workstream actions
  onCreateWorkstream: (name: string, description?: string, has_code?: boolean) => Promise<void>;
  onUpdateWorkstream: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDeleteWorkstream: (id: string) => Promise<void>;
  onSwapColumns: (draggedId: string, targetId: string) => void;
  // Task actions
  onAddTask: (workstreamId: string | null) => void;
  onRunTask: (taskId: string) => void;
  onRunWorkstream: (workstreamId: string) => void;
  onEditTask: (task: TaskView) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => Promise<void>;
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => void;
  // Job actions
  onTerminate: (jobId: string) => void;
  onReply: (jobId: string, answer: string) => void;
  onApprove: (jobId: string) => void;
  onReject: (jobId: string) => void;
  onRework: (jobId: string, note: string) => void;
  onDeleteJob: (jobId: string) => void;
  onMoveToBacklog: (jobId: string) => void;
  onContinue: (jobId: string) => void;
  onCreatePr: (workstreamId: string, options?: { review?: boolean }) => void;
  currentUserId?: string;
}

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
      {/* Backlog column */}
      <WorkstreamColumn
        workstream={null}
        tasks={tasksByWorkstream.__backlog__ || []}
        taskJobMap={taskJobMap}
        isBacklog
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

      {/* Workstream columns */}
      {sortedWorkstreams.map(ws => (
        <WorkstreamColumn
          key={ws.id}
          workstream={ws}
          tasks={tasksByWorkstream[ws.id] || []}
          taskJobMap={taskJobMap}
          isBacklog={false}
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
          onRenameWorkstream={(id, name) => onUpdateWorkstream(id, { name })}
          onDeleteWorkstream={onDeleteWorkstream}
          onUpdateWorkstream={onUpdateWorkstream}
          onAddTask={() => onAddTask(ws.id)}
          onRunWorkstream={() => onRunWorkstream(ws.id)}
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
          onCreatePr={(opts) => onCreatePr(ws.id, opts)}
          onArchive={async () => {
            try {
              await onUpdateWorkstream(ws.id, { status: 'archived' });
            } catch (err) {
              console.error('Archive failed:', err);
            }
          }}
        />
      ))}

      <AddWorkstreamComposer onCreateWorkstream={onCreateWorkstream} />

    </div>
  );
}
