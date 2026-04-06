import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobView } from '../components/job-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';

const UNTOUCHED_STATUSES = new Set(['backlog', 'todo']);

export interface ChainGroup {
  taskIds: string[];
  startIndex: number;
}

interface UseWorkstreamColumnStateArgs {
  workstream: WorkstreamView | null;
  tasks: TaskView[];
  taskJobMap: Record<string, JobView>;
  isBacklog: boolean;
  focusTaskId: string | null;
  focusWsId?: string | null;
  onRenameWorkstream?: (id: string, name: string) => void;
  classes: {
    cardWrap: string;
    cardHighlight: string;
    columnHighlight: string;
  };
}

export function useWorkstreamColumnState({
  workstream,
  tasks,
  taskJobMap,
  isBacklog,
  focusTaskId,
  focusWsId,
  onRenameWorkstream,
  classes,
}: UseWorkstreamColumnStateArgs) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(workstream?.name || '');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const chainGroups = useMemo(() => {
    const groups: ChainGroup[] = [];
    let index = 0;
    while (index < tasks.length) {
      if (index > 0) {
        const previousTask = tasks[index - 1];
        const task = tasks[index];
        const previousProduces = previousTask.chaining === 'produce' || previousTask.chaining === 'both';
        const currentAccepts = task.chaining === 'accept' || task.chaining === 'both';
        if (previousProduces && currentAccepts) {
          const lastGroup = groups[groups.length - 1];
          if (lastGroup && lastGroup.taskIds.includes(previousTask.id)) {
            lastGroup.taskIds.push(task.id);
          } else {
            groups.push({ taskIds: [previousTask.id, task.id], startIndex: index - 1 });
          }
          index++;
          continue;
        }
      }
      index++;
    }
    return groups;
  }, [tasks]);

  const getChainGroup = useCallback((taskId: string) => {
    return chainGroups.find(group => group.taskIds.includes(taskId)) || null;
  }, [chainGroups]);

  const freezeIndex = useMemo(() => {
    let lastTouched = -1;
    for (let index = 0; index < tasks.length; index++) {
      if (!UNTOUCHED_STATUSES.has(tasks[index].status || 'backlog')) {
        lastTouched = index;
      }
    }
    return lastTouched;
  }, [tasks]);

  const brokenLinks = useMemo(() => {
    if (isBacklog) return new Map<string, { up: boolean; down: boolean }>();
    const map = new Map<string, { up: boolean; down: boolean }>();
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index];
      const accepts = task.chaining === 'accept' || task.chaining === 'both';
      const produces = task.chaining === 'produce' || task.chaining === 'both';
      if (!accepts && !produces) continue;
      const previousTask = index > 0 ? tasks[index - 1] : null;
      const nextTask = index < tasks.length - 1 ? tasks[index + 1] : null;
      const up = accepts && !(previousTask && (previousTask.chaining === 'produce' || previousTask.chaining === 'both'));
      const down = produces && !(nextTask && (nextTask.chaining === 'accept' || nextTask.chaining === 'both'));
      if (up || down) map.set(task.id, { up, down });
    }
    return map;
  }, [tasks, isBacklog]);

  const hasBrokenLinks = brokenLinks.size > 0;
  const wsId = workstream?.id || null;
  const doneTasks = tasks.filter(task => task.status === 'done').length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const wsStatus = useMemo(() => {
    if (isBacklog) return null;
    const dbStatus = workstream?.status;
    if (dbStatus === 'reviewing') return 'reviewing' as const;
    if (dbStatus === 'review_failed') return 'review failed' as const;
    if (dbStatus === 'complete') return 'done' as const;
    if (dbStatus === 'merged' || dbStatus === 'archived') return 'merged' as const;
    if (totalTasks === 0) return 'open' as const;

    const hasRunningTask = tasks.some(task => {
      const job = taskJobMap[task.id];
      if (job && ['queued', 'running', 'paused'].includes(job.status)) return true;
      if (task.mode === 'human' && task.status === 'in_progress') return true;
      return false;
    });
    if (hasRunningTask) return 'in progress' as const;

    const hasPendingApproval = tasks.some(task => taskJobMap[task.id]?.status === 'review');
    if (hasPendingApproval) return 'pending review' as const;

    const hasFailedTask = tasks.some(task => taskJobMap[task.id]?.status === 'failed');
    if (hasFailedTask) return 'failed' as const;
    if (allDone) return 'pending review' as const;
    if (doneTasks > 0) return 'in progress' as const;
    return 'open' as const;
  }, [allDone, doneTasks, isBacklog, taskJobMap, tasks, totalTasks, workstream?.status]);

  const activeAiJobId = useMemo(() => {
    const task = tasks.find(currentTask => {
      const job = taskJobMap[currentTask.id];
      return job && ['queued', 'running', 'paused', 'review'].includes(job.status);
    });
    return task?.id ?? null;
  }, [tasks, taskJobMap]);

  const activeTaskId = useMemo(() => {
    if (activeAiJobId) return activeAiJobId;
    const humanTask = tasks.find(task => task.mode === 'human' && task.status === 'in_progress' && !taskJobMap[task.id]);
    return humanTask?.id ?? null;
  }, [tasks, taskJobMap, activeAiJobId]);

  const dragDisabledGlobal = !isBacklog && activeAiJobId !== null;

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
  }, [activeTaskId]);

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
  }, [classes.cardHighlight, classes.cardWrap, focusTaskId, tasks]);

  const focusedWorkstreamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusWsId || !workstream || workstream.id !== focusWsId || focusedWorkstreamRef.current === focusWsId) return;
    focusedWorkstreamRef.current = focusWsId;
    const column = columnRef.current;
    if (!column) return;
    column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    column.classList.add(classes.columnHighlight);
    column.addEventListener('animationend', () => column.classList.remove(classes.columnHighlight), { once: true });
  }, [classes.columnHighlight, focusWsId, workstream]);

  useEffect(() => {
    if (editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editing]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && workstream && trimmed !== workstream.name) {
      onRenameWorkstream?.(workstream.id, trimmed);
    }
    setEditing(false);
  };

  return {
    expandedIds,
    setExpandedIds,
    editing,
    setEditing,
    editName,
    setEditName,
    nameInputRef,
    tasksRef,
    columnRef,
    chainGroups,
    getChainGroup,
    freezeIndex,
    brokenLinks,
    hasBrokenLinks,
    wsId,
    doneTasks,
    totalTasks,
    allDone,
    progressPct,
    wsStatus,
    dragDisabledGlobal,
    handleRename,
  };
}
