import type { Flow, ProviderConfig } from '../lib/api';
import { BUILT_IN_TYPES } from '../lib/constants';
import {
  getFlowIdForType,
  PIPELINE_OPTIONS,
  type CustomTypeOption,
  type MemberOption,
} from './task-form-shared';
import type { FlowExecutionCapabilities } from '../../shared/flow-execution-capabilities';
import s from './TaskForm.module.css';

interface TaskTypeAssignmentSectionProps {
  flows: Flow[];
  members: MemberOption[];
  customTypes: CustomTypeOption[];
  type: string;
  customType: string;
  customPipeline: string;
  isCustomType: boolean;
  assignee: string;
  flowId: string;
  providerConfigId: string;
  providerModel: string;
  selectedFlow: Flow | null;
  selectedProvider: ProviderConfig | null;
  taskSelectableProviders: ProviderConfig[];
  flowCapabilities: FlowExecutionCapabilities | null;
  providerSelectionEnabled: boolean;
  modelSelectionEnabled: boolean;
  reasoningSelectionEnabled: boolean;
  executionSettingsLocked: boolean;
  effort: string;
  setType: (value: string) => void;
  setCustomType: (value: string) => void;
  setCustomPipeline: (value: string) => void;
  setIsCustomType: (value: boolean) => void;
  setAssignee: (value: string) => void;
  setFlowId: (value: string) => void;
  setProviderConfigId: (value: string) => void;
  setProviderModel: (value: string) => void;
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
  customPipeline,
  isCustomType,
  assignee,
  flowId,
  providerConfigId,
  providerModel,
  selectedFlow,
  selectedProvider,
  taskSelectableProviders,
  flowCapabilities,
  providerSelectionEnabled,
  modelSelectionEnabled,
  reasoningSelectionEnabled,
  executionSettingsLocked,
  effort,
  setType,
  setCustomType,
  setCustomPipeline,
  setIsCustomType,
  setAssignee,
  setFlowId,
  setProviderConfigId,
  setProviderModel,
  setMode,
  setEffort,
  setAutoContinue,
}: TaskTypeAssignmentSectionProps) {
  const modelOptions = flowCapabilities?.modelOptions || [];
  const modelListId = 'task-provider-models';

  let executionHelp = '';
  if (!selectedFlow) {
    executionHelp = 'Select an AI flow to configure task execution.';
  } else if (flowCapabilities?.invalidReason) {
    executionHelp = flowCapabilities.invalidReason;
  } else if (taskSelectableProviders.length === 0) {
    executionHelp = 'No enabled providers expose a task configuration that satisfies this flow.';
  } else if (flowCapabilities?.providerSelectionReason) {
    executionHelp = flowCapabilities.providerSelectionReason;
  } else if (flowCapabilities?.modelSelectionReason) {
    executionHelp = flowCapabilities.modelSelectionReason;
  } else if (!reasoningSelectionEnabled && flowCapabilities?.reasoningSelectionReason) {
    executionHelp = flowCapabilities.reasoningSelectionReason;
  }

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
              disabled={executionSettingsLocked}
              onChange={event => setCustomType(event.target.value)}
              autoFocus
            />
            <select
              className={s.select}
              value={customPipeline}
              disabled={executionSettingsLocked}
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
              disabled={executionSettingsLocked}
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
            disabled={executionSettingsLocked}
            onChange={event => {
              if (event.target.value === '__custom__') {
                setCustomPipeline(PIPELINE_OPTIONS.some(option => option.value === type) ? type : 'feature');
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
          disabled={executionSettingsLocked}
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

      {!assignee && providerSelectionEnabled && (
        <div className={s.field}>
          <label className={s.label}>Provider</label>
          <select
            aria-label="Provider"
            className={s.select}
            value={providerConfigId}
            disabled={executionSettingsLocked}
            onChange={event => setProviderConfigId(event.target.value)}
          >
            <option value="">Select a provider</option>
            {taskSelectableProviders.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!assignee && modelSelectionEnabled && (
        <div className={s.field}>
          <label className={s.label}>Model</label>
          <input
            className={s.input}
            list={modelListId}
            value={providerModel}
            disabled={executionSettingsLocked}
            onChange={event => setProviderModel(event.target.value)}
            placeholder={selectedProvider ? `Default: ${flowCapabilities?.resolvedTaskModel || selectedProvider.label}` : 'Select a provider first'}
          />
          <datalist id={modelListId}>
            {modelOptions.map(model => (
              <option key={model} value={model} />
            ))}
          </datalist>
        </div>
      )}

      {!assignee && providerSelectionEnabled && reasoningSelectionEnabled && (
        <div className={s.field}>
          <label className={s.label}>Reasoning</label>
          <select
            className={s.select}
            value={effort}
            disabled={executionSettingsLocked}
            onChange={event => setEffort(event.target.value)}
          >
            {(flowCapabilities?.supportedReasoningLevels ?? []).map(level => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
      )}

      {!assignee && (!providerSelectionEnabled || !modelSelectionEnabled || !reasoningSelectionEnabled || executionHelp) && (
        <div className={s.field}>
          <label className={s.label}>Execution</label>
          <div className={s.attachmentNotice}>{executionHelp || 'Execution settings are determined by the selected flow.'}</div>
        </div>
      )}

      {executionSettingsLocked && (
        <div className={s.field}>
          <label className={s.label}>Execution Lock</label>
          <div className={s.attachmentNotice}>This task has already started. Reset it before changing its execution settings.</div>
        </div>
      )}
    </div>
  );
}
