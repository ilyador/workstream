import type { Flow } from '../lib/api';
import type { FlowStepInput } from '../lib/flow-editor';
import { useFlowStepEditor } from '../hooks/useFlowStepEditor';
import { FlowStepFormFields } from './FlowStepFormFields';
import s from './FlowEditor.module.css';

interface FlowStepModalProps {
  flow: Flow;
  stepIndex: number;
  onSaveSteps: (flowId: string, steps: FlowStepInput[]) => Promise<void>;
  onClose: () => void;
}

export function FlowStepModal({ flow, stepIndex, onSaveSteps, onClose }: FlowStepModalProps) {
  const {
    isNew,
    steps,
    activeIndex,
    step,
    updateStep,
    toggleTool,
    toggleContext,
    handleSave,
    handleDelete,
  } = useFlowStepEditor({
    flow,
    stepIndex,
    onSaveSteps,
    onClose,
  });

  if (!step) return null;

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modalCard} ${s.modalBody}`} onClick={event => event.stopPropagation()}>
        <h2 className={s.modalHeading}>
          {isNew ? 'New step' : (step.name ? `Edit: ${step.name}` : `Edit step ${activeIndex + 1}`)}
        </h2>
        <FlowStepFormFields
          step={step}
          index={activeIndex}
          allSteps={steps}
          isNew={isNew}
          onUpdate={updateStep}
          onToggleTool={toggleTool}
          onToggleContext={toggleContext}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
