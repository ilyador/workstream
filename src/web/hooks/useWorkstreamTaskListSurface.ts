interface UseWorkstreamTaskListSurfaceArgs {
  tasksRef: React.RefObject<HTMLDivElement | null>;
  columnScrollIntervalRef: React.RefObject<ReturnType<typeof setInterval> | null>;
  draggedTaskId: string | null;
  updateDropIndicator: (clientY: number) => void;
  clearColumnScroll: () => void;
}

export function useWorkstreamTaskListSurface({
  tasksRef,
  columnScrollIntervalRef,
  draggedTaskId,
  updateDropIndicator,
  clearColumnScroll,
}: UseWorkstreamTaskListSurfaceArgs) {
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!draggedTaskId) return;

    updateDropIndicator(event.clientY);
    const container = tasksRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const edgeZone = 50;
    const scrollSpeed = 8;

    if (event.clientY < rect.top + edgeZone) {
      if (!columnScrollIntervalRef.current) {
        columnScrollIntervalRef.current = setInterval(() => {
          container.scrollTop -= scrollSpeed;
        }, 16);
      }
      return;
    }

    if (event.clientY > rect.bottom - edgeZone) {
      if (!columnScrollIntervalRef.current) {
        columnScrollIntervalRef.current = setInterval(() => {
          container.scrollTop += scrollSpeed;
        }, 16);
      }
      return;
    }

    clearColumnScroll();
  };

  return {
    handleDragOver,
    handleDragLeave: clearColumnScroll,
  };
}
