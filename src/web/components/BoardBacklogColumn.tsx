import { WorkstreamColumn } from './WorkstreamColumn';
import type { BoardColumnDataProps, BoardColumnDragProps, BoardProps, BoardTaskActionProps } from './board-types';
import type { TaskView } from '../lib/task-view';

interface BoardBacklogColumnProps extends BoardColumnDataProps, BoardColumnDragProps, BoardTaskActionProps {
  tasks: TaskView[];
  onAddTask: BoardProps['onAddTask'];
}

export function BoardBacklogColumn({
  tasks,
  taskJobMap,
  canRunAi,
  projectId,
  members,
  mentionedTaskIds,
  commentCounts,
  focusTaskId,
  draggedTaskId,
  draggedGroupIds,
  onDragTaskStart,
  onDragGroupStart,
  onDragTaskEnd,
  onDropTask,
  onAddTask,
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
  currentUserId,
}: BoardBacklogColumnProps) {
  return (
    <WorkstreamColumn
      workstream={null}
      tasks={tasks}
      taskJobMap={taskJobMap}
      isBacklog
      canRunAi={canRunAi}
      projectId={projectId}
      members={members}
      mentionedTaskIds={mentionedTaskIds}
      commentCounts={commentCounts}
      focusTaskId={focusTaskId}
      draggedTaskId={draggedTaskId}
      draggedGroupIds={draggedGroupIds}
      onDragTaskStart={onDragTaskStart}
      onDragGroupStart={onDragGroupStart}
      onDragTaskEnd={onDragTaskEnd}
      onDropTask={onDropTask}
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
  );
}
