import { useState } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import { useModal } from './modal-context';
import type { AiRuntimeStatus } from '../../shared/ai-runtimes.js';
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
  codingRuntimes: AiRuntimeStatus[];
  onSaveSteps: (flowId: string, steps: FlowStepInput[]) => Promise<void>;
  onClose: () => void;
}

export function useFlowStepEditor({
  flow,
  stepIndex,
  codingRuntimes,
  onSaveSteps,
  onClose,
}: UseFlowStepEditorArgs) {
  const isNew = stepIndex === -1;
  const modal = useModal();
  const sorted = sortedSteps(flow);
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    isNew ? [...sorted, makeBlankStep(sorted.length + 1, codingRuntimes)] : sorted
  );
  const activeIndex = isNew ? steps.length - 1 : stepIndex;
  const step = steps[activeIndex];

  const updateStep = (patch: Partial<FlowStep>) => {
    setSteps(current =>
      current.map((candidate, candidateIndex) => (
        candidateIndex === activeIndex ? { ...candidate, ...patch } : candidate
      ))
    );
  };

  const toggleTool = (tool: string) => {
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
  };

  const toggleContext = (source: string) => {
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
  };

  const handleSave = async () => {
    try {
      await onSaveSteps(flow.id, stepsPayload(steps));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to save flow steps'));
    }
  };

  const handleDelete = async () => {
    const nextSteps = steps
      .filter((_, candidateIndex) => candidateIndex !== activeIndex)
      .map((candidate, candidateIndex) => ({ ...candidate, position: candidateIndex + 1 }));
    try {
      await onSaveSteps(flow.id, stepsPayload(nextSteps));
      onClose();
    } catch (err) {
      await modal.alert('Error', getErrorMessage(err, 'Failed to delete flow step'));
    }
  };

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
