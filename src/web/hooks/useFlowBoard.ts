import { useCallback, useMemo, useState } from 'react';
import type React from 'react';
import type { Flow } from '../lib/api';
import { getErrorMessage, getStepMetaItems, sortedSteps, stepToTask, stepsPayload } from '../lib/flow-editor';
import { useBoardDrag } from './useBoardDrag';
import { useModal } from './modal-context';
import type { TaskCardMetaItem } from '../components/task-card-types';

interface UseFlowBoardArgs {
  flows: Flow[];
  setFlows: React.Dispatch<React.SetStateAction<Flow[]>>;
  projectId: string;
  onSaveSteps: (flowId: string, steps: ReturnType<typeof stepsPayload>) => Promise<void>;
  onCreateFlow: (data: { project_id: string; name: string; description?: string; steps?: ReturnType<typeof stepsPayload> }) => Promise<Flow>;
  onSwapColumns: (draggedId: string, targetId: string) => void;
}

export function useFlowBoard({
  flows,
  setFlows,
  projectId,
  onSaveSteps,
  onCreateFlow,
  onSwapColumns,
}: UseFlowBoardArgs) {
  const drag = useBoardDrag({ onSwapColumns });
  const modal = useModal();
  const [creating, setCreating] = useState(false);
  const [modalTarget, setModalTarget] = useState<{ flowId: string; stepIndex: number } | null>(null);

  const modalFlow = modalTarget ? flows.find(flow => flow.id === modalTarget.flowId) : null;

  const flowTasksMap = useMemo(() => {
    const map: Record<string, ReturnType<typeof stepToTask>[]> = {};
    for (const flow of flows) {
      map[flow.id] = sortedSteps(flow).map((step, index) => stepToTask(step, index));
    }
    return map;
  }, [flows]);

  const stepLookup = useMemo(() => {
    const map = new Map<string, { flowId: string; stepIndex: number }>();
    for (const flow of flows) {
      sortedSteps(flow).forEach((step, index) => map.set(step.id, { flowId: flow.id, stepIndex: index }));
    }
    return map;
  }, [flows]);

  const stepMetaMap = useMemo(() => {
    const map = new Map<string, TaskCardMetaItem[]>();
    for (const flow of flows) {
      for (const step of sortedSteps(flow)) {
        map.set(step.id, getStepMetaItems(step));
      }
    }
    return map;
  }, [flows]);

  const handleDropTask = useCallback(async (workstreamId: string | null, dropBeforeTaskId: string | null) => {
    if (!drag.draggedTaskId || !workstreamId) return;
    const info = stepLookup.get(drag.draggedTaskId);
    if (!info || info.flowId !== workstreamId) return;
    const flow = flows.find(candidate => candidate.id === workstreamId);
    if (!flow) return;

    const sorted = sortedSteps(flow);
    const fromIndex = sorted.findIndex(step => step.id === drag.draggedTaskId);
    if (fromIndex < 0) return;

    const nextSteps = [...sorted];
    const [movedStep] = nextSteps.splice(fromIndex, 1);

    if (dropBeforeTaskId) {
      const targetIndex = nextSteps.findIndex(step => step.id === dropBeforeTaskId);
      if (targetIndex >= 0) nextSteps.splice(targetIndex, 0, movedStep);
      else nextSteps.push(movedStep);
    } else {
      nextSteps.push(movedStep);
    }

    const reordered = nextSteps.map((step, index) => ({ ...step, position: index + 1 }));

    setFlows(current => current.map(flowItem => (
      flowItem.id === workstreamId ? { ...flowItem, flow_steps: reordered } : flowItem
    )));

    try {
      await onSaveSteps(workstreamId, stepsPayload(reordered));
    } catch (err) {
      setFlows(current => current.map(flowItem => (
        flowItem.id === workstreamId ? { ...flowItem, flow_steps: sorted } : flowItem
      )));
      await modal.alert('Error', getErrorMessage(err, 'Failed to reorder flow steps'));
    } finally {
      drag.setDraggedTaskId(null);
    }
  }, [drag, flows, modal, onSaveSteps, setFlows, stepLookup]);

  const handleNewFlow = useCallback(async () => {
    setCreating(true);
    try {
      await onCreateFlow({ project_id: projectId, name: 'New Flow', description: '', steps: [] });
    } catch (err) {
      console.error('Failed to create flow:', err);
    } finally {
      setCreating(false);
    }
  }, [onCreateFlow, projectId]);

  const openNewStepModal = useCallback((flowId: string) => {
    setModalTarget({ flowId, stepIndex: -1 });
  }, []);

  const openExistingStepModal = useCallback((taskId: string) => {
    const info = stepLookup.get(taskId);
    if (!info) return;
    setModalTarget({ flowId: info.flowId, stepIndex: info.stepIndex });
  }, [stepLookup]);

  const closeStepModal = useCallback(() => {
    setModalTarget(null);
  }, []);

  const handleDeleteStep = useCallback(async (taskId: string) => {
    const info = stepLookup.get(taskId);
    if (!info) return;
    const flow = flows.find(candidate => candidate.id === info.flowId);
    if (!flow) return;
    const nextSteps = sortedSteps(flow)
      .filter(step => step.id !== taskId)
      .map((step, index) => ({ ...step, position: index + 1 }));
    await onSaveSteps(info.flowId, stepsPayload(nextSteps));
  }, [flows, onSaveSteps, stepLookup]);

  return {
    creating,
    drag,
    flowTasksMap,
    modalFlow,
    modalTarget,
    stepMetaMap,
    handleDeleteStep,
    handleDropTask,
    handleNewFlow,
    openExistingStepModal,
    openNewStepModal,
    closeStepModal,
  };
}
