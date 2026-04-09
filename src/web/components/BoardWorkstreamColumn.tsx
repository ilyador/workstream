import { WorkstreamColumn } from './WorkstreamColumn';
import { useModal } from '../hooks/modal-context';
import type { BoardColumnDataProps, BoardColumnDragProps, BoardProps, BoardTaskActionProps } from './board-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import type { RelativeDropSide } from '../lib/optimistic-updates';

interface BoardWorkstreamColumnProps extends BoardColumnDataProps, BoardColumnDragProps, BoardTaskActionProps {
  workstream: WorkstreamView;
  tasks: TaskView[];
  focusWsId?: string | null;
  draggedWsId?: string | null;
  onColumnDragStart: (workstreamId: string) => void;
  onColumnDrop: (targetWorkstreamId: string, side: RelativeDropSide) => void;
  onUpdateWorkstream: BoardProps['onUpdateWorkstream'];
  onDeleteWorkstream: BoardProps['onDeleteWorkstream'];
  onAddTask: BoardProps['onAddTask'];
  onRunWorkstream: BoardProps['onRunWorkstream'];
  onCreatePr: BoardProps['onCreatePr'];
}

export function BoardWorkstreamColumn({
  workstream,
  tasks,
  taskJobMap,
  canRunAi,
  projectId,
  members,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  focusWsId,
  draggedTaskId,
  draggedGroupIds,
  draggedWsId,
  onDragTaskStart,
  onDragGroupStart,
  onDragTaskEnd,
  onDropTask,
  onColumnDragStart,
  onColumnDrop,
  onUpdateWorkstream,
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
  onRework,
  onDeleteJob,
  onMoveToBacklog,
  onContinue,
  onCreatePr,
  currentUserId,
}: BoardWorkstreamColumnProps) {
  const modal = useModal();

  return (
    <WorkstreamColumn
      workstream={workstream}
      tasks={tasks}
      taskJobMap={taskJobMap}
      isBacklog={false}
      canRunAi={canRunAi}
      projectId={projectId}
      members={members}
      mentionedTaskIds={mentionedTaskIds}
      commentCounts={commentCounts}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      draggedTaskId={draggedTaskId}
      draggedGroupIds={draggedGroupIds}
      draggedWsId={draggedWsId}
      onDragTaskStart={onDragTaskStart}
      onDragGroupStart={onDragGroupStart}
      onDragTaskEnd={onDragTaskEnd}
      onDropTask={onDropTask}
      onColumnDragStart={onColumnDragStart}
      onColumnDrop={onColumnDrop}
      onRenameWorkstream={(id, name) => onUpdateWorkstream(id, { name })}
      onDeleteWorkstream={onDeleteWorkstream}
      onUpdateWorkstream={onUpdateWorkstream}
      onAddTask={() => onAddTask(workstream.id)}
      onRunWorkstream={() => onRunWorkstream(workstream.id)}
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
      onCreatePr={(options) => onCreatePr(workstream.id, options)}
      onArchive={async () => {
        try {
          await onUpdateWorkstream(workstream.id, { status: 'archived' });
        } catch (err) {
          await modal.alert('Error', err instanceof Error ? err.message : 'Failed to archive workstream');
        }
      }}
    />
  );
}
