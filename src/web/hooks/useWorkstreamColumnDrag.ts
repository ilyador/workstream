import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

interface UseWorkstreamColumnDragArgs {
  tasksRef: React.RefObject<HTMLDivElement | null>;
  columnRef: React.RefObject<HTMLDivElement | null>;
  workstreamId: string | null;
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  draggedWsId?: string | null;
  isBacklog: boolean;
  onDropTask: (workstreamId: string | null, dropBeforeTaskId: string | null) => void;
  onColumnDrop?: (targetWsId: string) => void;
  classes: {
    chainGroup: string;
    cardWrap: string;
    dropBefore: string;
    dropAfter: string;
  };
}

export function useWorkstreamColumnDrag({
  tasksRef,
  columnRef,
  workstreamId,
  draggedTaskId,
  draggedGroupIds,
  draggedWsId,
  isBacklog,
  onDropTask,
  onColumnDrop,
  classes,
}: UseWorkstreamColumnDragArgs) {
  const [columnDropSide, setColumnDropSide] = useState<'left' | 'right' | null>(null);
  const dropIndexRef = useRef<string | null>(null);
  const dragCountRef = useRef(0);
  const colDragCountRef = useRef(0);
  const columnScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (columnScrollIntervalRef.current) clearInterval(columnScrollIntervalRef.current);
    document.getElementById('__drag-preview__')?.remove();
  }, []);

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
    const targets: Array<{ element: HTMLElement; taskId: string; isGroup: boolean }> = [];

    const groupedTaskIds = new Set<string>();
    const groups = container.querySelectorAll<HTMLElement>(`.${classes.chainGroup}`);
    groups.forEach(group => {
      const ids = (group.dataset.groupIds || '').split(',');
      if (ids.some(id => draggedIds.has(id))) return;
      ids.forEach(id => groupedTaskIds.add(id));
      targets.push({ element: group, taskId: ids[0], isGroup: true });
    });

    const wraps = container.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`);
    wraps.forEach(wrap => {
      const taskId = wrap.dataset.taskId || '';
      if (draggedIds.has(taskId) || groupedTaskIds.has(taskId)) return;
      targets.push({ element: wrap, taskId, isGroup: false });
    });

    targets.sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top);

    let dropBeforeTaskId: string | null = null;
    for (const target of targets) {
      const rect = target.element.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        dropBeforeTaskId = target.taskId;
        break;
      }
    }

    dropIndexRef.current = dropBeforeTaskId;

    if (dropBeforeTaskId) {
      const target = targets.find(item => item.taskId === dropBeforeTaskId);
      if (!target) return;
      if (target.isGroup) {
        const firstWrap = target.element.querySelector<HTMLElement>(`.${classes.cardWrap}`);
        firstWrap?.classList.add(classes.dropBefore);
        return;
      }
      target.element.classList.add(classes.dropBefore);
      return;
    }

    if (targets.length === 0) return;
    const lastTarget = targets[targets.length - 1];
    if (lastTarget.isGroup) {
      const lastWraps = lastTarget.element.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`);
      lastWraps[lastWraps.length - 1]?.classList.add(classes.dropAfter);
      return;
    }
    lastTarget.element.classList.add(classes.dropAfter);
  }, [
    tasksRef,
    draggedTaskId,
    draggedGroupIds,
    clearDropIndicator,
    classes.chainGroup,
    classes.cardWrap,
    classes.dropAfter,
    classes.dropBefore,
  ]);

  const clearColumnScroll = useCallback(() => {
    if (columnScrollIntervalRef.current) {
      clearInterval(columnScrollIntervalRef.current);
      columnScrollIntervalRef.current = null;
    }
  }, []);

  const handleColumnDragOver = useCallback((event: React.DragEvent) => {
    if (!draggedWsId || !workstreamId || draggedWsId === workstreamId) return;
    const column = columnRef.current;
    if (!column) return;
    const rect = column.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    setColumnDropSide(event.clientX < midX ? 'left' : 'right');
  }, [draggedWsId, workstreamId, columnRef]);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (draggedTaskId) {
      dragCountRef.current++;
    }
    if (draggedWsId && workstreamId && draggedWsId !== workstreamId) {
      colDragCountRef.current++;
    }
  }, [draggedTaskId, draggedWsId, workstreamId]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (draggedWsId) handleColumnDragOver(event);
  }, [draggedWsId, handleColumnDragOver]);

  const handleDragLeave = useCallback(() => {
    if (draggedTaskId) {
      dragCountRef.current--;
      if (dragCountRef.current <= 0) {
        dragCountRef.current = 0;
        clearDropIndicator();
        clearColumnScroll();
        dropIndexRef.current = null;
      }
    }
    if (draggedWsId && workstreamId) {
      colDragCountRef.current--;
      if (colDragCountRef.current <= 0) {
        colDragCountRef.current = 0;
        setColumnDropSide(null);
      }
    }
  }, [draggedTaskId, draggedWsId, workstreamId, clearDropIndicator, clearColumnScroll]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    clearColumnScroll();
    if (draggedTaskId) {
      clearDropIndicator();
      dragCountRef.current = 0;
      onDropTask(workstreamId, dropIndexRef.current);
      dropIndexRef.current = null;
    }
    if (draggedWsId && workstreamId && onColumnDrop && draggedWsId !== workstreamId) {
      colDragCountRef.current = 0;
      setColumnDropSide(null);
      onColumnDrop(workstreamId);
    }
  }, [
    draggedTaskId,
    draggedWsId,
    workstreamId,
    onColumnDrop,
    onDropTask,
    clearColumnScroll,
    clearDropIndicator,
  ]);

  const showDropLeft = !isBacklog && !!draggedWsId && !!workstreamId && draggedWsId !== workstreamId && columnDropSide === 'left';
  const showDropRight = !isBacklog && !!draggedWsId && !!workstreamId && draggedWsId !== workstreamId && columnDropSide === 'right';

  return {
    columnScrollIntervalRef,
    updateDropIndicator,
    clearColumnScroll,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    showDropLeft,
    showDropRight,
  };
}
