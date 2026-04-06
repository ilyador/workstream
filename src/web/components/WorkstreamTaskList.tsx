import React from 'react';
import { ArtifactConnector } from './ArtifactConnector';
import type { TaskCardProps } from './TaskCard';
import type { JobView } from './job-types';
import type { TaskView } from '../lib/task-view';
import s from './WorkstreamColumn.module.css';

interface ChainGroup {
  taskIds: string[];
  startIndex: number;
}

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

  const buildCardProps = (
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

  return (
    <div
      className={s.tasks}
      ref={tasksRef}
      onDragOver={(e) => {
        e.preventDefault();
        if (!draggedTaskId) return;

        updateDropIndicator(e.clientY);
        const container = tasksRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const edgeZone = 50;
        const scrollSpeed = 8;
        if (e.clientY < rect.top + edgeZone) {
          if (!columnScrollIntervalRef.current) {
            columnScrollIntervalRef.current = setInterval(() => {
              container.scrollTop -= scrollSpeed;
            }, 16);
          }
          return;
        }
        if (e.clientY > rect.bottom - edgeZone) {
          if (!columnScrollIntervalRef.current) {
            columnScrollIntervalRef.current = setInterval(() => {
              container.scrollTop += scrollSpeed;
            }, 16);
          }
          return;
        }
        clearColumnScroll();
      }}
      onDragLeave={() => {
        clearColumnScroll();
      }}
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
      {(() => {
        const rendered = new Set<string>();
        return tasks.map((task, index) => {
          if (rendered.has(task.id)) return null;

          const group = getChainGroup(task.id);
          if (group && index === group.startIndex) {
            const groupTasks = group.taskIds.map(id => tasks.find(t => t.id === id)!);
            const isGroupDragging = draggedGroupIds ? group.taskIds.some(id => draggedGroupIds.includes(id)) : false;
            group.taskIds.forEach(id => rendered.add(id));

            const handleGroupDragStart = (e?: React.DragEvent) => {
              if (e) {
                const chainGroupEl = (e.target as HTMLElement).closest(`.${s.chainGroup}`) as HTMLElement;
                if (chainGroupEl) {
                  const clone = chainGroupEl.cloneNode(true) as HTMLElement;
                  clone.style.width = `${chainGroupEl.offsetWidth}px`;
                  clone.style.transform = 'rotate(2deg) scale(1.02)';
                  clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)';
                  clone.style.borderRadius = '10px';
                  clone.style.opacity = '0.92';
                  clone.style.position = 'fixed';
                  clone.style.top = '-9999px';
                  clone.style.left = '-9999px';
                  clone.style.pointerEvents = 'none';
                  clone.id = '__drag-preview__';
                  document.getElementById('__drag-preview__')?.remove();
                  document.body.appendChild(clone);
                  e.dataTransfer.setDragImage(clone, chainGroupEl.offsetWidth / 2, 20);
                }
              }
              onDragGroupStart?.(group.taskIds);
            };

            const handleGroupDragEnd = () => {
              document.getElementById('__drag-preview__')?.remove();
              onDragTaskEnd();
            };

            return (
              <div
                key={`chain-${group.taskIds[0]}`}
                className={`${s.chainGroup} ${isGroupDragging ? s.chainGroupDragging : ''}`}
                data-group-ids={group.taskIds.join(',')}
              >
                {groupTasks.map((groupTask, groupIndex) => (
                  <React.Fragment key={groupTask.id}>
                    {groupIndex > 0 && (
                      <ArtifactConnector
                        taskId={groupTasks[groupIndex - 1].id}
                        projectId={projectId || undefined}
                      />
                    )}
                    <div className={s.cardWrap} data-task-id={groupTask.id}>
                      {renderCard(buildCardProps(groupTask, index, {
                        prevTaskId: groupIndex > 0 ? groupTasks[groupIndex - 1].id : (index > 0 ? tasks[index - 1]?.id : null),
                        onDragStart: handleGroupDragStart,
                        onDragEnd: handleGroupDragEnd,
                        isDragging: isGroupDragging,
                        dragDisabled: dragDisabledGlobal || index <= freezeIndex,
                        skipDragGhost: true,
                      }))}
                    </div>
                  </React.Fragment>
                ))}
              </div>
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
            <div key={task.id}>
              {showConnector && <ArtifactConnector taskId={prevTask.id} projectId={projectId || undefined} />}
              <div className={s.cardWrap} data-task-id={task.id}>
                {renderCard(buildCardProps(task, index, {
                  prevTaskId: prevTask?.id || null,
                  onDragStart: () => onDragTaskStart(task.id),
                  onDragEnd: onDragTaskEnd,
                  isDragging: draggedTaskId === task.id,
                  dragDisabled: dragDisabledGlobal || index <= freezeIndex,
                }))}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
