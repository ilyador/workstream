import { useState } from 'react';
import type { Flow, FlowStep } from '../lib/api';
import { MdField } from './MdField';
import { useModal } from '../hooks/modal-context';
import {
  ALL_CONTEXT_SOURCES,
  ALL_TOOLS,
  MODEL_OPTIONS,
  ON_MAX_RETRIES_OPTIONS,
} from '../lib/constants';
import {
  getErrorMessage,
  makeBlankStep,
  sortedSteps,
  stepsPayload,
  type FlowStepInput,
} from '../lib/flow-editor';
import s from './FlowEditor.module.css';

interface StepModalProps {
  step: FlowStep;
  index: number;
  allSteps: FlowStep[];
  isNew: boolean;
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function StepModal({
  step,
  index,
  allSteps,
  isNew,
  onUpdate,
  onToggleTool,
  onToggleContext,
  onSave,
  onDelete,
  onClose,
}: StepModalProps) {
  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modalCard} ${s.modalBody}`} onClick={event => event.stopPropagation()}>
        <h2 className={s.modalHeading}>
          {isNew ? 'New step' : (step.name ? `Edit: ${step.name}` : `Edit step ${index + 1}`)}
        </h2>
        <form onSubmit={event => event.preventDefault()} className={s.modalForm}>
          <input
            className={s.textInput}
            value={step.name}
            onChange={event => onUpdate({ name: event.target.value })}
            placeholder={`Step ${index + 1}`}
            autoFocus
          />

          <div className={s.field}>
            <label className={s.label}>Instructions</label>
            <MdField
              value={step.instructions}
              onChange={value => onUpdate({ instructions: value })}
              placeholder="What should the AI do in this step..."
            />
          </div>

          <div className={s.field}>
            <label className={s.label}>Model</label>
            <div className={s.segmented}>
              {MODEL_OPTIONS.map(model => (
                <button
                  key={model}
                  type="button"
                  className={`${s.segmentedBtn} ${step.model === model ? s.segmentedActive : ''}`}
                  onClick={() => onUpdate({ model })}
                >
                  {model.charAt(0).toUpperCase() + model.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Tools</label>
            <div className={s.checkboxGrid}>
              {ALL_TOOLS.map(tool => (
                <label key={tool} className={s.checkboxLabel}>
                  <input type="checkbox" checked={step.tools.includes(tool)} onChange={() => onToggleTool(tool)} />
                  {tool}
                </label>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <label className={s.label}>Context Sources</label>
            <div className={s.chipGrid}>
              {ALL_CONTEXT_SOURCES.map(source => (
                <button
                  key={source}
                  type="button"
                  className={`${s.chip} ${step.context_sources.includes(source) ? s.chipActive : ''}`}
                  onClick={() => onToggleContext(source)}
                >
                  {source}
                </button>
              ))}
            </div>
          </div>

          <label className={s.checkboxRow}>
            <input type="checkbox" checked={step.is_gate} onChange={event => onUpdate({ is_gate: event.target.checked })} />
            <span>Gate step (pass/fail verdict)</span>
          </label>

          {step.is_gate && (
            <div className={s.gateSection}>
              <div className={s.gateRow}>
                <div className={s.field}>
                  <label className={s.label}>On fail jump to</label>
                  <select
                    className={s.select}
                    value={step.on_fail_jump_to ?? ''}
                    onChange={event => {
                      const value = event.target.value;
                      onUpdate({ on_fail_jump_to: value === '' ? null : Number(value) });
                    }}
                  >
                    <option value="">None</option>
                    {allSteps.map((candidate, candidateIndex) => candidateIndex !== index && (
                      <option key={candidate.id} value={candidateIndex + 1}>
                        Step {candidateIndex + 1}
                        {candidate.name ? ` - ${candidate.name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={s.field}>
                  <label className={s.label}>Max retries</label>
                  <input
                    className={s.textInput}
                    type="number"
                    min={0}
                    max={10}
                    value={step.max_retries}
                    onChange={event => onUpdate({ max_retries: Number(event.target.value) || 0 })}
                  />
                </div>
                <div className={s.field}>
                  <label className={s.label}>On max retries</label>
                  <select
                    className={s.select}
                    value={step.on_max_retries}
                    onChange={event => onUpdate({ on_max_retries: event.target.value })}
                  >
                    {ON_MAX_RETRIES_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <div className={s.modalActions}>
            <button className="btn btnPrimary" type="button" onClick={onSave}>
              {isNew ? 'Create' : 'Save'}
            </button>
            <button className="btn btnSecondary" type="button" onClick={onClose}>
              Cancel
            </button>
            {!isNew && (
              <button
                className={`btn btnDanger btnSm ${s.modalDangerAction}`}
                type="button"
                onClick={onDelete}
              >
                Delete step
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

interface FlowStepModalProps {
  flow: Flow;
  stepIndex: number;
  onSaveSteps: (flowId: string, steps: FlowStepInput[]) => Promise<void>;
  onClose: () => void;
}

export function FlowStepModal({ flow, stepIndex, onSaveSteps, onClose }: FlowStepModalProps) {
  const isNew = stepIndex === -1;
  const modal = useModal();
  const sorted = sortedSteps(flow);
  const [steps, setSteps] = useState<FlowStep[]>(() =>
    isNew ? [...sorted, makeBlankStep(sorted.length + 1)] : sorted
  );
  const activeIndex = isNew ? steps.length - 1 : stepIndex;
  const step = steps[activeIndex];

  if (!step) return null;

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

  return (
    <StepModal
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
  );
}
