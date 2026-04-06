import type { Flow } from '../lib/api';
import { BUILT_IN_TYPES } from '../lib/constants';
import {
  getPreferredFlowId,
  PIPELINE_OPTIONS,
  type CustomTypeOption,
  type MemberOption,
  type WorkstreamOption,
} from './task-form-shared';
import s from './TaskForm.module.css';

interface TaskFormOptionsProps {
  workstreams: WorkstreamOption[];
  members: MemberOption[];
  flows: Flow[];
  customTypes: CustomTypeOption[];
  type: string;
  customType: string;
  customPipeline: string;
  isCustomType: boolean;
  assignee: string;
  flowId: string;
  effort: string;
  workstreamId: string;
  priority: string;
  multiagent: string;
  autoContinue: boolean;
  chaining: string;
  setType: (value: string) => void;
  setCustomType: (value: string) => void;
  setCustomPipeline: (value: string) => void;
  setIsCustomType: (value: boolean) => void;
  setAssignee: (value: string) => void;
  setFlowId: (value: string) => void;
  setMode: (value: string) => void;
  setEffort: (value: string) => void;
  setWorkstreamId: (value: string) => void;
  setPriority: (value: string) => void;
  setMultiagent: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
  setChaining: (value: string) => void;
}

export function TaskFormOptions({
  workstreams,
  members,
  flows,
  customTypes,
  type,
  customType,
  customPipeline,
  isCustomType,
  assignee,
  flowId,
  effort,
  workstreamId,
  priority,
  multiagent,
  autoContinue,
  chaining,
  setType,
  setCustomType,
  setCustomPipeline,
  setIsCustomType,
  setAssignee,
  setFlowId,
  setMode,
  setEffort,
  setWorkstreamId,
  setPriority,
  setMultiagent,
  setAutoContinue,
  setChaining,
}: TaskFormOptionsProps) {
  return (
    <>
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
              <select
                className={s.select}
                value={customPipeline}
                onChange={event => setCustomPipeline(event.target.value)}
                aria-label="Custom type pipeline"
              >
                {PIPELINE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
                  setCustomPipeline(
                    PIPELINE_OPTIONS.some(option => option.value === type) ? type : 'feature'
                  );
                  setIsCustomType(true);
                  return;
                }
                const nextType = event.target.value;
                setType(nextType);
                const matchingFlowId = getPreferredFlowId(flows, nextType);
                if (matchingFlowId) {
                  setFlowId(matchingFlowId);
                }
                setAssignee('');
                setMode('ai');
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

      <div className={s.row}>
        {workstreams.length > 0 && (
          <div className={s.field}>
            <label className={s.label}>Workstream</label>
            <select className={s.select} value={workstreamId} onChange={event => setWorkstreamId(event.target.value)}>
              <option value="">Backlog</option>
              {workstreams.map(workstream => (
                <option key={workstream.id} value={workstream.id}>
                  {workstream.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {!workstreamId && (
          <div className={s.field}>
            <label className={s.label}>Priority</label>
            <div className={s.segmented}>
              {(['critical', 'upcoming', 'backlog'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  className={`${s.segmentedBtn} ${priority === option ? s.segmentedActive : ''}`}
                  onClick={() => setPriority(option)}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={s.checkboxes}>
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={multiagent === 'yes'}
              onChange={event => setMultiagent(event.target.checked ? 'yes' : 'auto')}
            />
            <span>Use subagents</span>
          </label>
        )}
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={event => setAutoContinue(event.target.checked)}
            />
            <span>Continue automatically</span>
          </label>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label}>File chaining</label>
        <select className={s.select} value={chaining} onChange={event => setChaining(event.target.value)}>
          <option value="none">None</option>
          <option value="accept">Accept files from previous task</option>
          <option value="produce">Produce files for next task</option>
          <option value="both">Accept and produce files</option>
        </select>
      </div>
    </>
  );
}
