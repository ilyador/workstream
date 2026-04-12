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

const HIGHLIGHT_DURATION_MS = 5000;
const EXPAND_SETTLE_MS = 150;

function addHighlightClass(el: HTMLElement, className: string, animNameSubstring: string) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  const onEnd = (e: AnimationEvent) => {
    if (e.animationName.includes(animNameSubstring)) {
      el.classList.remove(className);
      el.removeEventListener('animationend', onEnd);
    }
  };
  el.addEventListener('animationend', onEnd);
  // Fallback cleanup if animation never fires (e.g. prefers-reduced-motion)
  setTimeout(() => {
    el.classList.remove(className);
    el.removeEventListener('animationend', onEnd);
  }, HIGHLIGHT_DURATION_MS + 200);
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
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focusTaskId) {
      focusedTaskRef.current = null;
      return;
    }
    if (focusedTaskRef.current === focusTaskId) return;

    if (!tasks.some(task => task.id === focusTaskId)) return;

    focusedTaskRef.current = focusTaskId;
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.add(focusTaskId);
      return next;
    });

    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      highlightTimerRef.current = null;
      const container = tasksRef.current;
      if (!container) return;

      const wraps = Array.from(container.querySelectorAll<HTMLElement>(`.${classes.cardWrap}`));
      const index = tasks.findIndex(task => task.id === focusTaskId);
      const element = wraps[index];
      if (!element) return;

      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const card = element.querySelector<HTMLElement>('[data-task-card="true"]');
      if (!card) return;

      addHighlightClass(card, classes.cardHighlight, 'highlightPulse');
    }, EXPAND_SETTLE_MS);

    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
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
    addHighlightClass(column, classes.columnHighlight, 'columnPulse');
  }, [classes.columnHighlight, columnRef, focusWsId, workstreamId]);

  useEffect(() => {
    if (!editing || !nameInputRef.current) return;
    nameInputRef.current.focus();
    nameInputRef.current.select();
  }, [editing, nameInputRef]);
}
