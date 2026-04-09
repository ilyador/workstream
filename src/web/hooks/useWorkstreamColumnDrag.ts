import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useTaskDropIndicator } from './useTaskDropIndicator';
import type { RelativeDropSide } from '../lib/optimistic-updates';

interface UseWorkstreamColumnDragArgs {
  tasksRef: React.RefObject<HTMLDivElement | null>;
  columnRef: React.RefObject<HTMLDivElement | null>;
  workstreamId: string | null;
  draggedTaskId: string | null;
  draggedGroupIds?: string[];
  draggedWsId?: string | null;
  isBacklog: boolean;
  onDropTask: (workstreamId: string | null, dropBeforeTaskId: string | null) => void;
  onColumnDrop?: (targetWsId: string, side: RelativeDropSide) => void;
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
  const dragCountRef = useRef(0);
  const colDragCountRef = useRef(0);
  const columnScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    clearDropIndicator,
    dropBeforeTaskIdRef,
    updateDropIndicator,
  } = useTaskDropIndicator({
    tasksRef,
    draggedTaskId,
    draggedGroupIds,
    classes,
  });

  useEffect(() => () => {
    if (columnScrollIntervalRef.current) clearInterval(columnScrollIntervalRef.current);
    document.getElementById('__drag-preview__')?.remove();
  }, []);

  const clearColumnScroll = useCallback(() => {
    if (columnScrollIntervalRef.current) {
      clearInterval(columnScrollIntervalRef.current);
      columnScrollIntervalRef.current = null;
    }
  }, []);

  const getColumnDropSide = useCallback((clientX: number): RelativeDropSide | null => {
    if (!draggedWsId || !workstreamId || draggedWsId === workstreamId) return null;
    const column = columnRef.current;
    if (!column) return null;
    const rect = column.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    return clientX < midX ? 'left' : 'right';
  }, [draggedWsId, workstreamId, columnRef]);

  const handleColumnDragOver = useCallback((event: React.DragEvent) => {
    setColumnDropSide(getColumnDropSide(event.clientX));
  }, [getColumnDropSide]);

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
        dropBeforeTaskIdRef.current = null;
      }
    }
    if (draggedWsId && workstreamId) {
      colDragCountRef.current--;
      if (colDragCountRef.current <= 0) {
        colDragCountRef.current = 0;
        setColumnDropSide(null);
      }
    }
  }, [draggedTaskId, draggedWsId, workstreamId, clearDropIndicator, clearColumnScroll, dropBeforeTaskIdRef]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    clearColumnScroll();
    if (draggedTaskId) {
      clearDropIndicator();
      dragCountRef.current = 0;
      onDropTask(workstreamId, dropBeforeTaskIdRef.current);
      dropBeforeTaskIdRef.current = null;
    }
    if (draggedWsId && workstreamId && onColumnDrop && draggedWsId !== workstreamId) {
      colDragCountRef.current = 0;
      setColumnDropSide(null);
      const dropSide = getColumnDropSide(event.clientX);
      if (dropSide) onColumnDrop(workstreamId, dropSide);
    }
  }, [
    draggedTaskId,
    draggedWsId,
    workstreamId,
    onColumnDrop,
    onDropTask,
    clearColumnScroll,
    clearDropIndicator,
    getColumnDropSide,
    dropBeforeTaskIdRef,
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
