import { ArtifactConnector } from './ArtifactConnector';
import type { TaskCardProps } from './TaskCard';
import type { BuildTaskCardProps } from './workstream-task-list-types';
import type { TaskFileDependency } from '../lib/file-passing';
import type { TaskView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

interface WorkstreamTaskListItemProps {
  task: TaskView;
  index: number;
  fileDependency: TaskFileDependency;
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
  fileDependency,
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
      {showConnector && fileDependency.previousTask && (
        <ArtifactConnector taskId={fileDependency.previousTask.id} projectId={projectId} />
      )}
      <div className={s.cardWrap} data-task-id={task.id}>
        {renderCard(buildCardProps(task, index, {
          fileDependency,
          onDragStart: () => onDragTaskStart(task.id),
          onDragEnd: onDragTaskEnd,
          isDragging: draggedTaskId === task.id,
          dragDisabled,
        }))}
      </div>
    </div>
  );
}
