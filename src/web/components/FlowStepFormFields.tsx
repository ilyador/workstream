import type { FlowStep } from '../lib/api';
import { MdField } from './MdField';
import {
  ALL_CONTEXT_SOURCES,
  ALL_TOOLS,
  ON_MAX_RETRIES_OPTIONS,
} from '../lib/constants';
import { CODING_RUNTIME_OPTIONS, defaultVariantForRuntime, runtimeVariantOptions } from '../../shared/ai-runtimes.js';
import s from './FlowEditor.module.css';

interface FlowStepFormFieldsProps {
  step: FlowStep;
  index: number;
  allSteps: FlowStep[];
  isNew: boolean;
  projectDataEnabled: boolean;
  onUpdate: (patch: Partial<FlowStep>) => void;
  onToggleTool: (tool: string) => void;
  onToggleContext: (source: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function FlowStepFormFields({
  step,
  index,
  allSteps,
  isNew,
  projectDataEnabled,
  onUpdate,
  onToggleTool,
  onToggleContext,
  onSave,
  onDelete,
  onClose,
}: FlowStepFormFieldsProps) {
  const variantOptions = runtimeVariantOptions(step.runtime_id);
  return (
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
        <label className={s.label}>Executor</label>
        <select
          className={s.select}
          value={step.runtime_id}
          onChange={event => {
            const runtimeId = event.target.value;
            onUpdate({
              runtime_kind: 'coding',
              runtime_id: runtimeId,
              runtime_variant: defaultVariantForRuntime(runtimeId),
            });
          }}
        >
          {CODING_RUNTIME_OPTIONS.map(runtime => (
            <option key={runtime.id} value={runtime.id}>
              {runtime.label}
            </option>
          ))}
        </select>
      </div>

      {variantOptions.length > 0 && (
        <div className={s.field}>
          <label className={s.label}>Variant</label>
          <div className={s.segmented}>
            {variantOptions.map(option => (
              <button
                key={option.id}
                type="button"
                className={`${s.segmentedBtn} ${step.runtime_variant === option.id ? s.segmentedActive : ''}`}
                onClick={() => onUpdate({ runtime_variant: option.id })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className={s.checkboxRow}>
        <input
          type="checkbox"
          checked={step.use_project_data}
          disabled={!projectDataEnabled}
          onChange={event => onUpdate({ use_project_data: event.target.checked })}
        />
        <span>Use Project Data</span>
      </label>
      {!projectDataEnabled && (
        <div className={s.hint}>Set up Project Data in project settings before enabling it on flow steps.</div>
      )}

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
  );
}
