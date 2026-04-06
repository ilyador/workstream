import type React from 'react';
import { updateTask, updateWorkstream as apiUpdateWorkstream, updateFlow as apiUpdateFlow, type Flow, type TaskRecord, type WorkstreamRecord } from '../lib/api';
import { applyPositionUpdates, applyTaskMove, replaceItemById } from '../lib/optimistic-updates';

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
  const handleSwapWorkstreams = (draggedId: string, targetId: string) => {
    const dragged = workstreams.find(workstream => workstream.id === draggedId);
    const target = workstreams.find(workstream => workstream.id === targetId);
    if (!dragged || !target) return;

    const draggedPosition = dragged.position;
    const targetPosition = target.position;

    setWorkstreams(prev => applyPositionUpdates(prev, {
      [draggedId]: targetPosition,
      [targetId]: draggedPosition,
    }));

    void (async () => {
      try {
        await Promise.all([
          apiUpdateWorkstream(draggedId, { position: targetPosition }),
          apiUpdateWorkstream(targetId, { position: draggedPosition }),
        ]);
      } catch (err) {
        setWorkstreams(prev => applyPositionUpdates(prev, {
          [draggedId]: draggedPosition,
          [targetId]: targetPosition,
        }));
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

  const handleSwapFlows = (draggedId: string, targetId: string) => {
    const dragged = flows.find(flow => flow.id === draggedId);
    const target = flows.find(flow => flow.id === targetId);
    if (!dragged || !target) return;

    const draggedPosition = dragged.position;
    const targetPosition = target.position;

    setFlows(prev => applyPositionUpdates(prev, {
      [draggedId]: targetPosition,
      [targetId]: draggedPosition,
    }, { sort: true }));

    void (async () => {
      try {
        await Promise.all([
          apiUpdateFlow(draggedId, { position: targetPosition }),
          apiUpdateFlow(targetId, { position: draggedPosition }),
        ]);
      } catch (err) {
        setFlows(prev => applyPositionUpdates(prev, {
          [draggedId]: draggedPosition,
          [targetId]: targetPosition,
        }, { sort: true }));
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
