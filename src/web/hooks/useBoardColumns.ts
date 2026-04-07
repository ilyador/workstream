import { useCallback, useMemo } from 'react';
import type { TaskRecord } from '../lib/api';
import { compareByPosition, toTaskView, type TaskView, type WorkstreamView } from '../lib/task-view';
import { mapPrimaryJobsByTask } from '../lib/job-selection';
import type { JobView } from '../components/job-types';

interface UseBoardColumnsArgs {
  workstreams: WorkstreamView[];
  tasks: TaskRecord[];
  jobs: JobView[];
  memberMap: Record<string, { name: string; initials: string }>;
  flowMap: Record<string, string>;
  typeFlowMap: Record<string, string>;
  draggedTaskId: string | null;
  draggedGroupIds: string[];
  onMoveTask: (taskId: string, workstreamId: string | null, newPosition: number) => void;
  clearDraggedTask: () => void;
}

export function useBoardColumns({
  workstreams,
  tasks,
  jobs,
  memberMap,
  flowMap,
  typeFlowMap,
  draggedTaskId,
  draggedGroupIds,
  onMoveTask,
  clearDraggedTask,
}: UseBoardColumnsArgs) {
  const taskJobMap = useMemo(() => {
    return mapPrimaryJobsByTask(jobs);
  }, [jobs]);

  const tasksByWorkstream = useMemo(() => {
    const groups: Record<string, TaskView[]> = { __backlog__: [] };
    for (const workstream of workstreams) groups[workstream.id] = [];

    for (const task of tasks) {
      const key = task.workstream_id || '__backlog__';
      if (key === '__backlog__' && (task.status === 'done' || task.status === 'canceled')) continue;
      if (!groups[key]) groups[key] = [];
      const resolvedFlowId = task.flow_id || typeFlowMap[task.type];
      const flowName = resolvedFlowId ? flowMap[resolvedFlowId] : null;
      groups[key].push(toTaskView(task, memberMap, flowName));
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort(compareByPosition);
    }
    return groups;
  }, [tasks, workstreams, memberMap, flowMap, typeFlowMap]);

  const sortedWorkstreams = useMemo(
    () => [...workstreams].sort((a, b) => a.position - b.position),
    [workstreams],
  );

  const members = useMemo(
    () => Object.entries(memberMap).map(([id, member]) => ({ id, name: member.name, initials: member.initials })),
    [memberMap],
  );

  const handleDropTask = useCallback((targetWsId: string | null, dropBeforeTaskId: string | null) => {
    if (!draggedTaskId) return;

    const idsToMove = draggedGroupIds.length > 0 ? draggedGroupIds : [draggedTaskId];
    const targetKey = targetWsId || '__backlog__';
    const idsSet = new Set(idsToMove);
    const targetTasks = (tasksByWorkstream[targetKey] || []).filter(task => !idsSet.has(task.id));

    const untouched = new Set(['backlog', 'todo']);
    let freezeIdx = -1;
    for (let index = 0; index < targetTasks.length; index++) {
      if (!untouched.has(targetTasks[index].status || 'backlog')) freezeIdx = index;
    }
    if (dropBeforeTaskId && freezeIdx >= 0) {
      const dropIdx = targetTasks.findIndex(task => task.id === dropBeforeTaskId);
      if (dropIdx >= 0 && dropIdx <= freezeIdx) return;
    }

    let basePosition: number;
    if (!dropBeforeTaskId) {
      const lastTask = targetTasks[targetTasks.length - 1];
      basePosition = lastTask ? (lastTask.position ?? 0) + 1 : 1;
    } else {
      const dropIdx = targetTasks.findIndex(task => task.id === dropBeforeTaskId);
      if (dropIdx === 0) {
        basePosition = (targetTasks[0]?.position ?? idsToMove.length) - idsToMove.length;
      } else if (dropIdx > 0) {
        const before = targetTasks[dropIdx - 1];
        const after = targetTasks[dropIdx];
        const gap = (after?.position ?? 0) - (before?.position ?? 0);
        const spacing = gap / (idsToMove.length + 1);
        basePosition = (before?.position ?? 0) + spacing;
      } else {
        const lastTask = targetTasks[targetTasks.length - 1];
        basePosition = lastTask ? (lastTask.position ?? 0) + 1 : 1;
      }
    }

    const step = idsToMove.length > 1 ? 0.001 : 0;
    for (let index = 0; index < idsToMove.length; index++) {
      onMoveTask(idsToMove[index], targetWsId, basePosition + index * step);
    }

    clearDraggedTask();
  }, [draggedTaskId, draggedGroupIds, tasksByWorkstream, onMoveTask, clearDraggedTask]);

  return {
    taskJobMap,
    tasksByWorkstream,
    sortedWorkstreams,
    members,
    handleDropTask,
  };
}
