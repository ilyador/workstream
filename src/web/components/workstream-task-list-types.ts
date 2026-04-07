import type React from 'react';
import type { TaskCardProps } from './TaskCard';
import type { TaskFileDependency } from '../lib/file-passing';
import type { TaskView } from '../lib/task-view';

export interface ChainGroup {
  taskIds: string[];
  startIndex: number;
}

export interface TaskCardDragOptions {
  fileDependency?: TaskFileDependency | null;
  isDragging?: boolean;
  dragDisabled?: boolean;
  skipDragGhost?: boolean;
  onDragStart?: (event?: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export type BuildTaskCardProps = (
  task: TaskView,
  index: number,
  options?: TaskCardDragOptions,
) => TaskCardProps;
