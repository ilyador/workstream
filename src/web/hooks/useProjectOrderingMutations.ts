import type React from 'react';
import { updateTask, updateWorkstream as apiUpdateWorkstream, updateFlow as apiUpdateFlow, type Flow, type TaskRecord, type WorkstreamRecord } from '../lib/api';
import { applyPositionUpdates, applyTaskMove, buildRelativeMovePositionUpdates, replaceItemById, type RelativeDropSide } from '../lib/optimistic-updates';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface AlertModal {
  alert: (title: string, message: string) => Promise<unknown>;
}

interface UseProjectOrderingMutationsArgs {
  modal: AlertModal;
  workstreams: WorkstreamRecord[];
  setWorkstreams: React.Dispatch<React.SetStateAction<WorkstreamRecord[]>>;
  reloadWorkstreams: () => Promise<unknown>;
  tasks: TaskRecord[];
  setTasks: React.Dispatch<React.SetStateAction<TaskRecord[]>>;
  reloadTasks: () => Promise<unknown>;
  flows: Flow[];
  setFlows: React.Dispatch<React.SetStateAction<Flow[]>>;
  reloadFlows: () => Promise<unknown>;
}

export function useProjectOrderingMutations({
  modal,
  workstreams,
  setWorkstreams,
  reloadWorkstreams,
  tasks,
  setTasks,
  reloadTasks,
  flows,
  setFlows,
  reloadFlows,
}: UseProjectOrderingMutationsArgs) {
  const handleSwapWorkstreams = (
    draggedId: string,
    targetId: string,
    side: RelativeDropSide,
    orderedIds: string[],
  ) => {
    const scopedWorkstreams = workstreams
      .filter(workstream => orderedIds.includes(workstream.id))
      .sort((a, b) => a.position - b.position);
    const updates = buildRelativeMovePositionUpdates(scopedWorkstreams, draggedId, targetId, side);
    const entries = Object.entries(updates);
    if (entries.length === 0) return;

    const originalPositions = Object.fromEntries(
      entries.map(([id]) => {
        const workstream = workstreams.find(candidate => candidate.id === id);
        return [id, workstream?.position ?? 0];
      }),
    );

    setWorkstreams(prev => applyPositionUpdates(prev, updates, { sort: true }));

    void (async () => {
      try {
        await Promise.all(entries.map(([id, position]) => apiUpdateWorkstream(id, { position })));
      } catch (err) {
        setWorkstreams(prev => applyPositionUpdates(prev, originalPositions, { sort: true }));
        await reloadWorkstreams();
        await modal.alert('Error', getErrorMessage(err, 'Failed to reorder workstreams'));
      }
    })();
  };

  const handleMoveTask = (taskId: string, workstreamId: string | null, newPosition: number) => {
    const originalTask = tasks.find(task => task.id === taskId);
    if (!originalTask) return;

    setTasks(prev => applyTaskMove(prev, taskId, workstreamId, newPosition));

    void (async () => {
      try {
        await updateTask(taskId, { workstream_id: workstreamId, position: newPosition });
      } catch (err) {
        setTasks(prev => replaceItemById(prev, originalTask));
        await reloadTasks();
        await modal.alert('Error', getErrorMessage(err, 'Failed to move task'));
      }
    })();
  };

  const handleSwapFlows = (
    draggedId: string,
    targetId: string,
    side: RelativeDropSide,
    orderedIds: string[],
  ) => {
    const scopedFlows = flows
      .filter(flow => orderedIds.includes(flow.id))
      .sort((a, b) => a.position - b.position);
    const updates = buildRelativeMovePositionUpdates(scopedFlows, draggedId, targetId, side);
    const entries = Object.entries(updates);
    if (entries.length === 0) return;

    const originalPositions = Object.fromEntries(
      entries.map(([id]) => {
        const flow = flows.find(candidate => candidate.id === id);
        return [id, flow?.position ?? 0];
      }),
    );

    setFlows(prev => applyPositionUpdates(prev, updates, { sort: true }));

    void (async () => {
      try {
        await Promise.all(entries.map(([id, position]) => apiUpdateFlow(id, { position })));
      } catch (err) {
        setFlows(prev => applyPositionUpdates(prev, originalPositions, { sort: true }));
        await reloadFlows();
        await modal.alert('Error', getErrorMessage(err, 'Failed to reorder flows'));
      }
    })();
  };

  return {
    handleSwapWorkstreams,
    handleMoveTask,
    handleSwapFlows,
  };
}
