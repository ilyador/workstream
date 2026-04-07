import { useCallback, useRef } from 'react';
import type React from 'react';

interface UseTaskDropIndicatorArgs {
  tasksRef: React.RefObject<HTMLDivElement | null>;
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  classes: {
    chainGroup: string;
    cardWrap: string;
    dropBefore: string;
    dropAfter: string;
  };
}

interface DropTarget {
  element: HTMLElement;
  taskId: string;
  isGroup: boolean;
}

function collectDropTargets(
  container: HTMLDivElement,
  draggedIds: Set<string>,
  classes: UseTaskDropIndicatorArgs['classes'],
) {
  const targets: DropTarget[] = [];
  const groupedTaskIds = new Set<string>();

  container.querySelectorAll<HTMLElement>(`.${classes.chainGroup}`).forEach(group => {
    const ids = (group.dataset.groupIds || '').split(',');
    if (ids.some(id => draggedIds.has(id))) return;
    ids.forEach(id => groupedTaskIds.add(id));
    targets.push({ element: group, taskId: ids[0], isGroup: true });
  });

  container.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`).forEach(wrap => {
    const taskId = wrap.dataset.taskId || '';
    if (draggedIds.has(taskId) || groupedTaskIds.has(taskId)) return;
    targets.push({ element: wrap, taskId, isGroup: false });
  });

  targets.sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);
  return targets;
}

function markDropTarget(
  target: DropTarget,
  className: string,
  side: 'before' | 'after',
  classes: UseTaskDropIndicatorArgs['classes'],
) {
  if (target.isGroup) {
    const wraps = target.element.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`);
    const wrap = side === 'after' ? wraps[wraps.length - 1] : wraps[0];
    wrap?.classList.add(className);
    return;
  }

  target.element.classList.add(className);
}

export function useTaskDropIndicator({
  tasksRef,
  draggedTaskId,
  draggedGroupIds,
  classes,
}: UseTaskDropIndicatorArgs) {
  const dropBeforeTaskIdRef = useRef<string | null>(null);

  const clearDropIndicator = useCallback(() => {
    const container = tasksRef.current;
    if (!container) return;
    container.querySelectorAll(`.${classes.dropBefore}, .${classes.dropAfter}`).forEach(element => {
      element.classList.remove(classes.dropBefore, classes.dropAfter);
    });
  }, [tasksRef, classes.dropAfter, classes.dropBefore]);

  const updateDropIndicator = useCallback((clientY: number) => {
    const container = tasksRef.current;
    if (!container || !draggedTaskId) return;
    clearDropIndicator();

    const draggedIds = new Set(draggedGroupIds && draggedGroupIds.length > 0 ? draggedGroupIds : [draggedTaskId]);
    const targets = collectDropTargets(container, draggedIds, classes);

    let dropBeforeTaskId: string | null = null;
    for (const target of targets) {
      const rect = target.element.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        dropBeforeTaskId = target.taskId;
        break;
      }
    }

    dropBeforeTaskIdRef.current = dropBeforeTaskId;

    if (dropBeforeTaskId) {
      const target = targets.find(item => item.taskId === dropBeforeTaskId);
      if (target) markDropTarget(target, classes.dropBefore, 'before', classes);
      return;
    }

    const lastTarget = targets[targets.length - 1];
    if (lastTarget) markDropTarget(lastTarget, classes.dropAfter, 'after', classes);
  }, [
    tasksRef,
    draggedTaskId,
    draggedGroupIds,
    clearDropIndicator,
    classes,
  ]);

  return {
    clearDropIndicator,
    dropBeforeTaskIdRef,
    updateDropIndicator,
  };
}
