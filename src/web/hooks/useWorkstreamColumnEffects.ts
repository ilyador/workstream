import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { TaskView } from '../lib/task-view';

interface UseWorkstreamColumnEffectsArgs {
  activeTaskId: string | null;
  focusTaskId: string | null;
  focusWsId?: string | null;
  workstreamId: string | null;
  tasks: TaskView[];
  editing: boolean;
  setExpandedIds: Dispatch<SetStateAction<Set<string>>>;
  nameInputRef: RefObject<HTMLInputElement | null>;
  tasksRef: RefObject<HTMLDivElement | null>;
  columnRef: RefObject<HTMLDivElement | null>;
  classes: {
    cardWrap: string;
    cardHighlight: string;
    columnHighlight: string;
  };
}

export function useWorkstreamColumnEffects({
  activeTaskId,
  focusTaskId,
  focusWsId,
  workstreamId,
  tasks,
  editing,
  setExpandedIds,
  nameInputRef,
  tasksRef,
  columnRef,
  classes,
}: UseWorkstreamColumnEffectsArgs) {
  const prevActiveRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTaskId || activeTaskId === prevActiveRef.current) return;

    const frameId = requestAnimationFrame(() => {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(activeTaskId);
        return next;
      });
    });

    prevActiveRef.current = activeTaskId;
    return () => cancelAnimationFrame(frameId);
  }, [activeTaskId, setExpandedIds]);

  const focusedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusTaskId || focusedTaskRef.current === focusTaskId) return;

    const matchingTask = tasks.find(task => task.id === focusTaskId);
    if (!matchingTask) return;

    focusedTaskRef.current = focusTaskId;
    const frameId = requestAnimationFrame(() => {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(focusTaskId);
        return next;
      });

      const container = tasksRef.current;
      if (!container) return;

      const wraps = Array.from(container.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`));
      const index = tasks.findIndex(task => task.id === focusTaskId);
      const element = wraps[index];
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const card = element.querySelector<HTMLElement>('[data-task-card="true"]');
      if (!card) return;

      card.classList.add(classes.cardHighlight);
      card.addEventListener('animationend', () => card.classList.remove(classes.cardHighlight), { once: true });
    });

    return () => cancelAnimationFrame(frameId);
  }, [classes.cardHighlight, classes.cardWrap, focusTaskId, setExpandedIds, tasks, tasksRef]);

  const focusedWorkstreamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusWsId || !workstreamId || workstreamId !== focusWsId || focusedWorkstreamRef.current === focusWsId) {
      return;
    }

    focusedWorkstreamRef.current = focusWsId;
    const column = columnRef.current;
    if (!column) return;

    column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    column.classList.add(classes.columnHighlight);
    column.addEventListener('animationend', () => column.classList.remove(classes.columnHighlight), { once: true });
  }, [classes.columnHighlight, columnRef, focusWsId, workstreamId]);

  useEffect(() => {
    if (!editing || !nameInputRef.current) return;
    nameInputRef.current.focus();
    nameInputRef.current.select();
  }, [editing, nameInputRef]);
}
