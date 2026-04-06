import React from 'react';
import { ArtifactConnector } from './ArtifactConnector';
import type { TaskCardProps } from './TaskCard';
import type { BuildTaskCardProps, ChainGroup } from './workstream-task-list-types';
import type { TaskView } from '../lib/task-view';
import { clearDragPreview, setClonedDragPreview } from '../lib/drag-preview';
import s from './WorkstreamColumn.module.css';

interface WorkstreamTaskChainGroupProps {
  group: ChainGroup;
  groupTasks: TaskView[];
  index: number;
  previousTaskId: string | null;
  projectId?: string;
  isDragging: boolean;
  dragDisabled: boolean;
  buildCardProps: BuildTaskCardProps;
  renderCard: (props: TaskCardProps) => React.ReactNode;
  onDragGroupStart?: (taskIds: string[]) => void;
  onDragTaskEnd: () => void;
}

export function WorkstreamTaskChainGroup({
  group,
  groupTasks,
  index,
  previousTaskId,
  projectId,
  isDragging,
  dragDisabled,
  buildCardProps,
  renderCard,
  onDragGroupStart,
  onDragTaskEnd,
}: WorkstreamTaskChainGroupProps) {
  const handleGroupDragStart = (event?: React.DragEvent) => {
    if (event) {
      const chainGroupEl = (event.target as HTMLElement).closest('[data-chain-group="true"]') as HTMLElement | null;
      if (chainGroupEl) {
        setClonedDragPreview(chainGroupEl, event.dataTransfer);
      }
    }
    onDragGroupStart?.(group.taskIds);
  };

  const handleGroupDragEnd = () => {
    clearDragPreview();
    onDragTaskEnd();
  };

  return (
    <div
      className={`${s.chainGroup} ${isDragging ? s.chainGroupDragging : ''}`}
      data-group-ids={group.taskIds.join(',')}
      data-chain-group="true"
    >
      {groupTasks.map((groupTask, groupIndex) => (
        <React.Fragment key={groupTask.id}>
          {groupIndex > 0 && (
            <ArtifactConnector
              taskId={groupTasks[groupIndex - 1].id}
              projectId={projectId}
            />
          )}
          <div className={s.cardWrap} data-task-id={groupTask.id}>
            {renderCard(buildCardProps(groupTask, index, {
              prevTaskId: groupIndex > 0
                ? groupTasks[groupIndex - 1].id
                : previousTaskId,
              onDragStart: handleGroupDragStart,
              onDragEnd: handleGroupDragEnd,
              isDragging,
              dragDisabled,
              skipDragGhost: true,
            }))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
