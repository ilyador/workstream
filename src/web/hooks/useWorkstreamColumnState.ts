import { useCallback, useMemo, useRef, useState } from 'react';
import type { JobView } from '../components/job-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';
import {
  buildBrokenLinks,
  buildChainGroups,
  getActiveTaskId,
  getFreezeIndex,
  getReorderBlockingTaskId,
  getWorkstreamStatus,
  hasAiTasks,
} from './workstream-column-derived';
import { useWorkstreamColumnEffects } from './useWorkstreamColumnEffects';

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

  const chainGroups = useMemo(() => buildChainGroups(tasks), [tasks]);
  const containsAiTasks = useMemo(() => hasAiTasks(tasks), [tasks]);

  const getChainGroup = useCallback((taskId: string) => {
    return chainGroups.find(group => group.taskIds.includes(taskId)) || null;
  }, [chainGroups]);

  const freezeIndex = useMemo(() => getFreezeIndex(tasks), [tasks]);
  const brokenLinks = useMemo(() => buildBrokenLinks(tasks, isBacklog), [tasks, isBacklog]);

  const hasBrokenLinks = brokenLinks.size > 0;
  const wsId = workstream?.id || null;
  const doneTasks = tasks.filter(task => task.status === 'done').length;
  const totalTasks = tasks.length;
  const allDone = totalTasks > 0 && doneTasks === totalTasks;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const wsStatus = useMemo(() => getWorkstreamStatus({
    workstreamStatus: workstream?.status,
    isBacklog,
    totalTasks,
    doneTasks,
    allDone,
    tasks,
    taskJobMap,
  }), [allDone, doneTasks, isBacklog, taskJobMap, tasks, totalTasks, workstream?.status]);

  const activeTaskId = useMemo(() => getActiveTaskId(tasks, taskJobMap), [tasks, taskJobMap]);
  const reorderBlockingTaskId = useMemo(() => getReorderBlockingTaskId(tasks, taskJobMap), [tasks, taskJobMap]);
  const dragDisabledGlobal = !isBacklog && reorderBlockingTaskId !== null;

  useWorkstreamColumnEffects({
    activeTaskId,
    focusTaskId,
    focusWsId,
    workstreamId: wsId,
    tasks,
    editing,
    setExpandedIds,
    nameInputRef,
    tasksRef,
    columnRef,
    classes,
  });

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
    containsAiTasks,
    allDone,
    progressPct,
    wsStatus,
    dragDisabledGlobal,
    handleRename,
  };
}
