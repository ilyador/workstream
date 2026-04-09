import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import type { RelativeDropSide } from '../lib/optimistic-updates';

interface UseBoardDragOptions {
  onSwapColumns: (draggedId: string, targetId: string, side: RelativeDropSide) => void;
}

export function useBoardDrag({ onSwapColumns }: UseBoardDragOptions) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedGroupIds, setDraggedGroupIds] = useState<string[]>([]);
  const [draggedWsId, setDraggedWsId] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (scrollInterval.current) clearInterval(scrollInterval.current);
  }, []);

  const handleDragGroupStart = (taskIds: string[]) => {
    setDraggedTaskId(taskIds[0]);
    setDraggedGroupIds(taskIds);
  };

  const handleColumnDrop = (targetId: string, side: RelativeDropSide) => {
    if (!draggedWsId || draggedWsId === targetId) return;
    onSwapColumns(draggedWsId, targetId, side);
    setDraggedWsId(null);
  };

  const handleDragEnd = () => {
    setDraggedTaskId(null);
    setDraggedGroupIds([]);
    setDraggedWsId(null);
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  };

  const handleBoardDragOver = (e: React.DragEvent) => {
    const board = boardRef.current;
    if (!board || (!draggedTaskId && !draggedWsId)) return;

    const rect = board.getBoundingClientRect();
    const edgeZone = 80;
    const scrollSpeed = 12;

    if (e.clientX < rect.left + edgeZone) {
      if (!scrollInterval.current) {
        scrollInterval.current = setInterval(() => {
          board.scrollLeft -= scrollSpeed;
        }, 16);
      }
    } else if (e.clientX > rect.right - edgeZone) {
      if (!scrollInterval.current) {
        scrollInterval.current = setInterval(() => {
          board.scrollLeft += scrollSpeed;
        }, 16);
      }
    } else {
      if (scrollInterval.current) {
        clearInterval(scrollInterval.current);
        scrollInterval.current = null;
      }
    }
  };

  return {
    draggedTaskId,
    setDraggedTaskId,
    draggedGroupIds,
    draggedWsId,
    setDraggedWsId,
    handleDragGroupStart,
    handleColumnDrop,
    handleDragEnd,
    handleBoardDragOver,
    boardRef,
    isDragging: !!(draggedTaskId || draggedWsId),
  };
}
