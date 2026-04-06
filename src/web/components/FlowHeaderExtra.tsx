import type { Flow } from '../lib/api';
import { BUILT_IN_TYPES } from '../lib/constants';
import s from './FlowEditor.module.css';

interface FlowHeaderExtraProps {
  flow: Flow;
  allFlows: Flow[];
  onSave: (flowId: string, updates: { default_types?: string[] }) => Promise<void>;
  taskTypes?: string[];
}

export function FlowHeaderExtra({ flow, allFlows, onSave, taskTypes }: FlowHeaderExtraProps) {
  const steps = flow.flow_steps;
  const availableTaskTypes = taskTypes?.length ? taskTypes : BUILT_IN_TYPES;

  return (
    <>
      <select
        className={s.typeSelect}
        value=""
        onChange={e => {
          const type = e.target.value;
          if (!type) return;
          const current = flow.default_types || [];
          onSave(flow.id, {
            default_types: current.includes(type) ? current.filter(item => item !== type) : [...current, type],
          });
        }}
        title="Default task types for this flow"
      >
        <option value="">
          {(flow.default_types || []).length > 0 ? (flow.default_types || []).join(', ') : 'types'}
        </option>
        {availableTaskTypes.map(type => {
          const owned = (flow.default_types || []).includes(type);
          const usedElsewhere = allFlows.some(other => other.id !== flow.id && (other.default_types || []).includes(type));
          return (
            <option key={type} value={type} disabled={usedElsewhere}>
              {owned ? '\u2713 ' : ''}
              {type}
              {usedElsewhere ? ' (other flow)' : ''}
            </option>
          );
        })}
      </select>
      <span className={s.stepCount}>
        {steps.length} {steps.length === 1 ? 'step' : 'steps'}
      </span>
    </>
  );
}
