import type { Flow } from '../lib/api';
import { BUILT_IN_TYPES } from '../lib/constants';
import {
  getFlowIdForType,
  type CustomTypeOption,
  type MemberOption,
} from './task-form-shared';
import s from './TaskForm.module.css';

interface TaskTypeAssignmentSectionProps {
  flows: Flow[];
  members: MemberOption[];
  customTypes: CustomTypeOption[];
  type: string;
  customType: string;
  isCustomType: boolean;
  assignee: string;
  flowId: string;
  effort: string;
  setType: (value: string) => void;
  setCustomType: (value: string) => void;
  setIsCustomType: (value: boolean) => void;
  setAssignee: (value: string) => void;
  setFlowId: (value: string) => void;
  setMode: (value: string) => void;
  setEffort: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
}

export function TaskTypeAssignmentSection({
  flows,
  members,
  customTypes,
  type,
  customType,
  isCustomType,
  assignee,
  flowId,
  effort,
  setType,
  setCustomType,
  setIsCustomType,
  setAssignee,
  setFlowId,
  setMode,
  setEffort,
  setAutoContinue,
}: TaskTypeAssignmentSectionProps) {
  return (
    <div className={s.row}>
      <div className={s.field}>
        <label className={s.label}>Type</label>
        {isCustomType ? (
          <div className={s.customTypeRow}>
            <input
              className={s.input}
              placeholder="e.g. docs, spike, deploy"
              value={customType}
              onChange={event => setCustomType(event.target.value)}
              autoFocus
            />
            <button
              type="button"
              className={s.customTypeCancel}
              onClick={() => {
                setIsCustomType(false);
                setCustomType('');
              }}
              title="Use preset type"
            >
              &times;
            </button>
          </div>
        ) : (
          <select
            aria-label="Type"
            className={s.select}
            value={type}
            onChange={event => {
              if (event.target.value === '__custom__') {
                setIsCustomType(true);
                return;
              }
              const nextType = event.target.value;
              setType(nextType);
              const matchingFlowId = getFlowIdForType(flows, nextType);
              if (matchingFlowId) {
                setFlowId(matchingFlowId);
                setAssignee('');
                setMode('ai');
              }
            }}
          >
            {BUILT_IN_TYPES.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {customTypes.filter(option => !BUILT_IN_TYPES.includes(option.name)).map(option => (
              <option key={option.id} value={option.name}>
                {option.name}
              </option>
            ))}
            <option value="__custom__">custom...</option>
          </select>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label}>Assignee</label>
        <select
          aria-label="Assignee"
          className={s.select}
          value={assignee ? `human:${assignee}` : (flowId ? `flow:${flowId}` : '')}
          onChange={event => {
            const value = event.target.value;
            if (value.startsWith('flow:')) {
              setFlowId(value.slice(5));
              setAssignee('');
              setMode('ai');
            } else if (value.startsWith('human:')) {
              setAssignee(value.slice(6));
              setFlowId('');
              setMode('human');
              setAutoContinue(false);
            } else {
              setAssignee('');
              setFlowId('');
              setMode('ai');
            }
          }}
        >
          {flows.length > 0 && (
            <optgroup label="AI Flows">
              {flows.map(flow => (
                <option key={flow.id} value={`flow:${flow.id}`}>
                  {flow.name}
                </option>
              ))}
            </optgroup>
          )}
          {flows.length === 0 && <option value="">AI</option>}
          {members.length > 0 && (
            <optgroup label="Team">
              {members.map(member => (
                <option key={member.id} value={`human:${member.id}`}>
                  {member.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {!assignee && (
        <div className={s.field}>
          <label className={s.label}>Effort</label>
          <select className={s.select} value={effort} onChange={event => setEffort(event.target.value)}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="max">max</option>
          </select>
        </div>
      )}
    </div>
  );
}
