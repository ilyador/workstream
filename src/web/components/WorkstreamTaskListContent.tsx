import type { TaskCardProps } from './TaskCard';
import { WorkstreamTaskChainGroup } from './WorkstreamTaskChainGroup';
import { WorkstreamTaskListItem } from './WorkstreamTaskListItem';
import type { BuildTaskCardProps, ChainGroup } from './workstream-task-list-types';
import type { TaskView } from '../lib/task-view';

interface WorkstreamTaskListContentProps {
  tasks: TaskView[];
  chainGroups: ChainGroup[];
  getChainGroup: (taskId: string) => ChainGroup | null;
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  projectId?: string;
  freezeIndex: number;
  dragDisabledGlobal: boolean;
  buildCardProps: BuildTaskCardProps;
  renderCard: (props: TaskCardProps) => React.ReactNode;
  onDragTaskStart: (taskId: string) => void;
  onDragGroupStart?: (taskIds: string[]) => void;
  onDragTaskEnd: () => void;
}

export function WorkstreamTaskListContent({
  tasks,
  chainGroups,
  getChainGroup,
  draggedTaskId,
  draggedGroupIds,
  projectId,
  freezeIndex,
  dragDisabledGlobal,
  buildCardProps,
  renderCard,
  onDragTaskStart,
  onDragGroupStart,
  onDragTaskEnd,
}: WorkstreamTaskListContentProps) {
  const rendered = new Set<string>();

  return tasks.map((task, index) => {
    if (rendered.has(task.id)) return null;

    const group = getChainGroup(task.id);
    if (group && index === group.startIndex) {
      const groupTasks = group.taskIds.map(id => tasks.find(candidate => candidate.id === id)!);
      const isGroupDragging = draggedGroupIds ? group.taskIds.some(id => draggedGroupIds.includes(id)) : false;
      group.taskIds.forEach(id => rendered.add(id));

      return (
        <WorkstreamTaskChainGroup
          key={`chain-${group.taskIds[0]}`}
          group={group}
          groupTasks={groupTasks}
          index={index}
          previousTask={index > 0 ? tasks[index - 1] || null : null}
          projectId={projectId}
          isDragging={isGroupDragging}
          dragDisabled={dragDisabledGlobal || index <= freezeIndex}
          buildCardProps={buildCardProps}
          renderCard={renderCard}
          onDragGroupStart={onDragGroupStart}
          onDragTaskEnd={onDragTaskEnd}
        />
      );
    }

    if (group) return null;

    const prevTask = index > 0 ? tasks[index - 1] : null;
    const showConnector = !!(
      prevTask &&
      prevTask.status === 'done' &&
      task.chaining &&
      ['accept', 'both'].includes(task.chaining) &&
      !chainGroups.some(chainGroup => chainGroup.taskIds.includes(task.id))
    );

    return (
      <WorkstreamTaskListItem
        key={task.id}
        task={task}
        index={index}
        prevTask={prevTask}
        projectId={projectId}
        draggedTaskId={draggedTaskId}
        dragDisabled={dragDisabledGlobal || index <= freezeIndex}
        showConnector={showConnector}
        buildCardProps={buildCardProps}
        renderCard={renderCard}
        onDragTaskStart={onDragTaskStart}
        onDragTaskEnd={onDragTaskEnd}
      />
    );
  });
}
