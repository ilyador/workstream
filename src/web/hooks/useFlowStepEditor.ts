import { useCallback, useState } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import { useModal } from './modal-context';
import {
  getErrorMessage,
  makeBlankStep,
  sortedSteps,
  stepsPayload,
  type FlowStepInput,
} from '../lib/flow-editor';

interface UseFlowStepEditorArgs {
  flow: Flow;
  stepIndex: number;
  onSaveSteps: (flowId: string, steps: FlowStepInput[]) => Promise<void>;
  onClose: () => void;
}

export function useFlowStepEditor({
  flow,
  stepIndex,
  onSaveSteps,
  onClose,
}: UseFlowStepEditorArgs) {
  const isNew = stepIndex === -1;
  const modal = useModal();
  const sorted = sortedSteps(flow);
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    isNew ? [...sorted, makeBlankStep(sorted.length + 1, flow.provider_binding)] : sorted
  );
  const activeIndex = isNew ? steps.length - 1 : stepIndex;
  const step = steps[activeIndex];

  const updateStep = useCallback((patch: Partial<FlowStep>) => {
    setSteps(current =>
      current.map((candidate, candidateIndex) => (
        candidateIndex === activeIndex ? { ...candidate, ...patch } : candidate
      ))
    );
  }, [activeIndex]);

  const toggleTool = useCallback((tool: string) => {
    setSteps(current =>
      current.map((candidate, candidateIndex) => {
        if (candidateIndex !== activeIndex) return candidate;
        return {
          ...candidate,
          tools: candidate.tools.includes(tool)
            ? candidate.tools.filter(item => item !== tool)
            : [...candidate.tools, tool],
        };
      })
    );
  }, [activeIndex]);

  const toggleContext = useCallback((source: string) => {
    setSteps(current =>
      current.map((candidate, candidateIndex) => {
        if (candidateIndex !== activeIndex) return candidate;
        return {
          ...candidate,
          context_sources: candidate.context_sources.includes(source)
            ? candidate.context_sources.filter(item => item !== source)
            : [...candidate.context_sources, source],
        };
      })
    );
  }, [activeIndex]);

  const handleSave = useCallback(async () => {
    try {
      await onSaveSteps(flow.id, stepsPayload(steps));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to save flow steps'));
    }
  }, [flow.id, modal, onClose, onSaveSteps, steps]);

  const handleDelete = useCallback(async () => {
    const nextSteps = steps
      .filter((_, candidateIndex) => candidateIndex !== activeIndex)
      .map((candidate, candidateIndex) => ({ ...candidate, position: candidateIndex + 1 }));
    try {
      await onSaveSteps(flow.id, stepsPayload(nextSteps));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to delete flow step'));
    }
  }, [activeIndex, flow.id, modal, onClose, onSaveSteps, steps]);

  return {
    isNew,
    steps,
    activeIndex,
    step,
    updateStep,
    toggleTool,
    toggleContext,
    handleSave,
    handleDelete,
  };
}
