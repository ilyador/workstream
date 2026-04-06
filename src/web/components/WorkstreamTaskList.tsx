import React from 'react';
import type { TaskCardProps } from './TaskCard';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import type { BuildTaskCardProps, ChainGroup } from './workstream-task-list-types';
import { WorkstreamTaskListContent } from './WorkstreamTaskListContent';
import { useWorkstreamTaskListSurface } from '../hooks/useWorkstreamTaskListSurface';
import s from './WorkstreamColumn.module.css';

interface WorkstreamTaskListProps {
  tasks: TaskView[];
  taskJobMap: Record<string, JobView>;
  isBacklog: boolean;
  canRunAi: boolean;
  projectId: string | null;
  members?: Array<{ id: string; name: string; initials: string }>;
  mentionedTaskIds: Set<string>;
  commentCounts?: Record<string, number>;
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  expandedIds: Set<string>;
  setExpandedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  freezeIndex: number;
  dragDisabledGlobal: boolean;
  brokenLinks: Map<string, { up: boolean; down: boolean }>;
  chainGroups: ChainGroup[];
  getChainGroup: (taskId: string) => ChainGroup | null;
  onDragTaskStart: (taskId: string) => void;
  onDragGroupStart?: (taskIds: string[]) => void;
  onDragTaskEnd: () => void;
  onRunTask?: (taskId: string) => void;
  onEditTask?: (task: TaskView) => void;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTask?: (taskId: string, data: Record<string, unknown>) => void;
  onTerminate?: (jobId: string) => void;
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
  onRework?: (jobId: string, note: string) => void;
  onDeleteJob?: (jobId: string) => void;
  onMoveToBacklog?: (jobId: string) => void;
  onContinue?: (jobId: string) => void;
  metaItems?: (taskId: string) => { label: string; value: string }[] | undefined;
  hideComments?: boolean;
  listHeader?: React.ReactNode;
  renderCard: (props: TaskCardProps) => React.ReactNode;
  tasksRef: React.RefObject<HTMLDivElement | null>;
  columnScrollIntervalRef: React.RefObject<ReturnType<typeof setInterval> | null>;
  updateDropIndicator: (clientY: number) => void;
  clearColumnScroll: () => void;
}

export function WorkstreamTaskList({
  tasks,
  taskJobMap,
  isBacklog,
  canRunAi,
  projectId,
  members,
  mentionedTaskIds,
  commentCounts,
  draggedTaskId,
  draggedGroupIds,
  expandedIds,
  setExpandedIds,
  freezeIndex,
  dragDisabledGlobal,
  brokenLinks,
  chainGroups,
  getChainGroup,
  onDragTaskStart,
  onDragGroupStart,
  onDragTaskEnd,
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
  metaItems,
  hideComments,
  listHeader,
  renderCard,
  tasksRef,
  columnScrollIntervalRef,
  updateDropIndicator,
  clearColumnScroll,
}: WorkstreamTaskListProps) {
  const toggleExpanded = (taskId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const buildCardProps: BuildTaskCardProps = (
    task: TaskView,
    index: number,
    options?: {
      prevTaskId?: string | null;
      isDragging?: boolean;
      dragDisabled?: boolean;
      skipDragGhost?: boolean;
      onDragStart?: (e?: React.DragEvent) => void;
      onDragEnd?: () => void;
    },
  ): TaskCardProps => ({
    task,
    job: taskJobMap[task.id] || null,
    canRunAi,
    isBacklog,
    showPriority: isBacklog,
    projectId: projectId || undefined,
    mentionMembers: members,
    hasUnreadMention: mentionedTaskIds.has(task.id),
    commentCount: commentCounts?.[task.id] || 0,
    brokenLink: brokenLinks.get(task.id) || null,
    prevTaskId: options?.prevTaskId ?? null,
    isExpanded: expandedIds.has(task.id),
    onToggleExpand: () => toggleExpanded(task.id),
    onRun: isBacklog || brokenLinks.has(task.id) ? undefined : onRunTask,
    onEdit: onEditTask ? () => onEditTask(task) : undefined,
    onDelete: onDeleteTask && index > freezeIndex ? () => onDeleteTask(task.id) : undefined,
    onUpdateTask,
    onTerminate,
    onReply,
    onApprove,
    onReject,
    onRework,
    onDeleteJob,
    onMoveToBacklog,
    onContinue,
    onDragStart: options?.onDragStart,
    onDragEnd: options?.onDragEnd,
    isDragging: options?.isDragging,
    dragDisabled: options?.dragDisabled,
    skipDragGhost: options?.skipDragGhost,
    metaItems: metaItems?.(task.id),
    hideComments,
  });
  const { handleDragOver, handleDragLeave } = useWorkstreamTaskListSurface({
    tasksRef,
    columnScrollIntervalRef,
    draggedTaskId,
    updateDropIndicator,
    clearColumnScroll,
  });

  return (
    <div
      className={s.tasks}
      ref={tasksRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {listHeader}
      {tasks.length === 0 && draggedTaskId && (
        <div className={s.emptyDropZone}>Drop here</div>
      )}
      {tasks.length === 0 && !draggedTaskId && (
        <div className={s.empty}>
          {isBacklog ? 'No tasks in backlog' : 'Drop tasks here'}
        </div>
      )}
      <WorkstreamTaskListContent
        tasks={tasks}
        chainGroups={chainGroups}
        getChainGroup={getChainGroup}
        draggedTaskId={draggedTaskId}
        draggedGroupIds={draggedGroupIds}
        projectId={projectId || undefined}
        freezeIndex={freezeIndex}
        dragDisabledGlobal={dragDisabledGlobal}
        buildCardProps={buildCardProps}
        renderCard={renderCard}
        onDragTaskStart={onDragTaskStart}
        onDragGroupStart={onDragGroupStart}
        onDragTaskEnd={onDragTaskEnd}
      />
    </div>
  );
}
