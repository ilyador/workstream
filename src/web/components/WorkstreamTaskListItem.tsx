import { ArtifactConnector } from './ArtifactConnector';
import type { TaskCardProps } from './TaskCard';
import type { BuildTaskCardProps } from './workstream-task-list-types';
import type { TaskView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

interface WorkstreamTaskListItemProps {
  task: TaskView;
  index: number;
  prevTask: TaskView | null;
  projectId?: string;
  draggedTaskId: string | null;
  dragDisabled: boolean;
  showConnector: boolean;
  buildCardProps: BuildTaskCardProps;
  renderCard: (props: TaskCardProps) => React.ReactNode;
  onDragTaskStart: (taskId: string) => void;
  onDragTaskEnd: () => void;
}

export function WorkstreamTaskListItem({
  task,
  index,
  prevTask,
  projectId,
  draggedTaskId,
  dragDisabled,
  showConnector,
  buildCardProps,
  renderCard,
  onDragTaskStart,
  onDragTaskEnd,
}: WorkstreamTaskListItemProps) {
  return (
    <div>
      {showConnector && prevTask && (
        <ArtifactConnector taskId={prevTask.id} projectId={projectId} />
      )}
      <div className={s.cardWrap} data-task-id={task.id}>
        {renderCard(buildCardProps(task, index, {
          prevTaskId: prevTask?.id || null,
          prevTask,
          onDragStart: () => onDragTaskStart(task.id),
          onDragEnd: onDragTaskEnd,
          isDragging: draggedTaskId === task.id,
          dragDisabled,
        }))}
      </div>
    </div>
  );
}
