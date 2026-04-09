import { stringField, type DbRecord } from './authz.js';
import type { FlowConfig } from './flow-config.js';
import { resolveFlowStepProviderConfigs } from './flow-steps.js';
import { resolveFlowForTask } from './flow-resolution.js';
import {
  getProjectProviderConfigs,
  getProviderConfigById,
} from './providers/registry.js';
import type { ProviderConfigRecord } from './providers/types.js';
import { supabase } from './supabase.js';
import {
  deriveFlowExecutionCapabilities,
  type FlowExecutionShape,
} from '../shared/flow-execution-capabilities.js';
import {
  formatModelId,
  parseModelId,
} from '../shared/provider-model.js';
import {
  normalizeMultiagentModeForCapabilities,
  normalizeReasoningLevelForCapabilities,
  resolveTaskSelectedStepModel,
} from '../shared/provider-task-config.js';
import {
  isTaskSelectedFlow,
  type FlowProviderBinding,
} from '../shared/flow-provider-binding.js';

export const TASK_EXECUTION_SETTING_KEYS = [
  'mode',
  'assignee',
  'flow_id',
  'provider_config_id',
  'provider_model',
  'effort',
  'multiagent',
] as const;

const TASK_RESET_STATUSES = new Set(['backlog', 'todo']);
const QUEUEABLE_TASK_STATUSES = new Set(['backlog', 'todo']);

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function mergeTaskView(currentTask: DbRecord | null | undefined, updates: DbRecord): DbRecord {
  return {
    ...(currentTask || {}),
    ...updates,
  };
}

export function isAiRunnableTask(task: DbRecord | null | undefined): boolean {
  return stringField(task, 'mode') === 'ai' && !nullableString(task?.assignee);
}

export function isQueueableTask(task: DbRecord | null | undefined): boolean {
  return isAiRunnableTask(task)
    && nullableString(task?.flow_id) !== null
    && QUEUEABLE_TASK_STATUSES.has(stringField(task, 'status') || 'backlog');
}

export function taskExecutionGeneration(task: DbRecord | null | undefined): number {
  return typeof task?.execution_generation === 'number' && Number.isInteger(task.execution_generation) && task.execution_generation > 0
    ? task.execution_generation
    : 1;
}

export function taskExecutionLockOwner(task: DbRecord | null | undefined): string | null {
  return nullableString(task?.active_job_id) ?? nullableString(task?.execution_settings_locked_job_id);
}

function compatibleProviders(
  configs: ProviderConfigRecord[],
  flowShape: FlowExecutionShape,
): ProviderConfigRecord[] {
  return configs.filter(config => (
    config.is_enabled
    && !deriveFlowExecutionCapabilities(flowShape, config.task_config, null).invalidReason
  ));
}

async function loadFlowExecutionShape(projectId: string, flowId: string | null): Promise<FlowExecutionShape> {
  if (!flowId) return { provider_binding: 'flow_locked', flow_steps: [] };
  const { data, error } = await supabase
    .from('flows')
    .select('provider_binding, flow_steps(name, model, tools, context_sources)')
    .eq('id', flowId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load flow execution settings: ${error.message}`);
  return {
    provider_binding: typeof data?.provider_binding === 'string' ? data.provider_binding : 'flow_locked',
    flow_steps: Array.isArray(data?.flow_steps) ? data.flow_steps as Array<Record<string, unknown>> : [],
  };
}

export function hasTaskExecutionSettingChanges(updates: DbRecord): boolean {
  return TASK_EXECUTION_SETTING_KEYS.some(key => key in updates);
}

export function isTaskExecutionLocked(task: DbRecord | null | undefined): boolean {
  return taskExecutionLockOwner(task) !== null
    || (typeof task?.execution_settings_locked_at === 'string' && task.execution_settings_locked_at.length > 0);
}

export function shouldUnlockTaskExecutionSettings(status: unknown): boolean {
  return typeof status === 'string' && TASK_RESET_STATUSES.has(status);
}

export function taskExecutionUnlockUpdate(task: DbRecord | null | undefined): {
  active_job_id: null;
  execution_generation: number;
  execution_settings_locked_at: null;
  execution_settings_locked_job_id: null;
} {
  const advanceGeneration = isTaskExecutionLocked(task)
    || nullableString(task?.status) === 'done'
    || nullableString(task?.status) === 'failed'
    || nullableString(task?.status) === 'review';
  return {
    active_job_id: null,
    execution_generation: taskExecutionGeneration(task) + (advanceGeneration ? 1 : 0),
    execution_settings_locked_at: null,
    execution_settings_locked_job_id: null,
  };
}

export const taskExecutionResetUpdate = taskExecutionUnlockUpdate;

async function loadTaskExecutionRow(taskId: string): Promise<DbRecord> {
  const { data: taskRow, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  if (error) throw new Error(`Failed to load task execution settings: ${error.message}`);
  return taskRow as DbRecord;
}

export async function loadTaskExecutionUnlockUpdate(taskId: string) {
  return taskExecutionUnlockUpdate(await loadTaskExecutionRow(taskId));
}

export async function ensureTaskExecutionJobOwnership(
  taskId: string,
  jobId: string,
  startedGeneration?: number | null,
): Promise<DbRecord> {
  const task = await loadTaskExecutionRow(taskId);
  const owner = taskExecutionLockOwner(task);

  if (!owner && isTaskExecutionLocked(task)) {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        active_job_id: jobId,
        execution_settings_locked_job_id: jobId,
      })
      .eq('id', taskId)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to adopt execution ownership: ${error.message}`);
    return data as DbRecord;
  }

  if (owner !== jobId) {
    if (!isTaskExecutionLocked(task)) {
      throw new Error('This task was reset after the job started. Start a new run instead of continuing the old job.');
    }
    throw new Error('This task is already locked to a different execution. Start a new run instead of continuing the old job.');
  }

  if (startedGeneration != null && taskExecutionGeneration(task) !== startedGeneration) {
    throw new Error('This task was reset after the job started. Start a new run instead of continuing the old job.');
  }

  return task;
}

export async function lockTaskExecutionSettings(
  taskId: string,
  jobId: string,
  requestedGeneration: number,
): Promise<DbRecord | null> {
  const lockTimestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from('tasks')
    .update({
      active_job_id: jobId,
      execution_settings_locked_at: lockTimestamp,
      execution_settings_locked_job_id: jobId,
      status: 'in_progress',
    })
    .eq('id', taskId)
    .eq('mode', 'ai')
    .eq('execution_generation', requestedGeneration)
    .is('assignee', null)
    .is('active_job_id', null)
    .in('status', [...QUEUEABLE_TASK_STATUSES])
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to lock task execution settings: ${error.message}`);
  if (data) return data as DbRecord;

  const task = await loadTaskExecutionRow(taskId);
  const owner = taskExecutionLockOwner(task);
  if (!isAiRunnableTask(task)) return null;
  if (taskExecutionGeneration(task) !== requestedGeneration) return null;
  if (owner === jobId) return task;
  if (owner) throw new Error('Task execution settings are locked by a different job');
  return null;
}

export interface ResolvedTaskExecutionSelection {
  flowBinding: FlowProviderBinding;
  taskSelectionEnabled: boolean;
  flowCapabilities: ReturnType<typeof deriveFlowExecutionCapabilities>;
  providerConfig: ProviderConfigRecord | null;
  providerModel: string | null;
  normalizedEffort: string;
  normalizedMultiagent: string;
}

export async function resolveTaskExecutionSelection(
  projectId: string,
  taskLike: DbRecord,
): Promise<ResolvedTaskExecutionSelection> {
  const mode = stringField(taskLike, 'mode') || 'ai';
  const assignee = nullableString(taskLike.assignee);
  const flowId = nullableString(taskLike.flow_id);

  if (mode === 'ai' && !assignee && !flowId) {
    throw new Error('AI tasks require an assigned flow');
  }

  const flowShape = await loadFlowExecutionShape(projectId, flowId);
  const flowBinding = typeof flowShape.provider_binding === 'string' && flowShape.provider_binding === 'task_selected'
    ? 'task_selected'
    : 'flow_locked';

  if (mode !== 'ai' || assignee) {
    return {
      flowBinding,
      taskSelectionEnabled: false,
      flowCapabilities: deriveFlowExecutionCapabilities(flowShape, null, null),
      providerConfig: null,
      providerModel: null,
      normalizedEffort: 'low',
      normalizedMultiagent: 'auto',
    };
  }

  if (flowBinding !== 'task_selected') {
    return {
      flowBinding,
      taskSelectionEnabled: false,
      flowCapabilities: deriveFlowExecutionCapabilities(flowShape, null, null),
      providerConfig: null,
      providerModel: null,
      normalizedEffort: 'low',
      normalizedMultiagent: 'auto',
    };
  }

  const explicitProviderConfigId = nullableString(taskLike.provider_config_id);
  let providerConfig = explicitProviderConfigId
    ? await getProviderConfigById(projectId, explicitProviderConfigId)
    : null;

  if (!providerConfig && !explicitProviderConfigId) {
    const compatible = compatibleProviders(await getProjectProviderConfigs(projectId), flowShape);
    if (compatible.length === 1) {
      providerConfig = compatible[0];
    } else if (compatible.length > 1) {
      throw new Error('Multiple enabled providers satisfy this flow. Pick one explicitly.');
    }
  }

  if (!providerConfig) {
    throw new Error('No enabled provider is configured to satisfy this flow');
  }
  if (!providerConfig.is_enabled) {
    throw new Error(`Provider '${providerConfig.label}' is disabled`);
  }

  const explicitProviderModel = nullableString(taskLike.provider_model);
  const flowCapabilities = deriveFlowExecutionCapabilities(flowShape, providerConfig.task_config, explicitProviderModel);
  if (flowCapabilities.invalidReason) {
    throw new Error(flowCapabilities.invalidReason);
  }

  const providerModel = flowCapabilities.modelSelectable
    ? flowCapabilities.resolvedTaskModel
    : null;

  return {
    flowBinding,
    taskSelectionEnabled: true,
    flowCapabilities,
    providerConfig,
    providerModel,
    normalizedEffort: flowCapabilities.reasoningSelectable
      ? normalizeReasoningLevelForCapabilities(flowCapabilities.supportedReasoningLevels, stringField(taskLike, 'effort'))
      : 'low',
    normalizedMultiagent: flowCapabilities.subagentsSelectable
      ? normalizeMultiagentModeForCapabilities(flowCapabilities.subagentsSelectable, stringField(taskLike, 'multiagent'))
      : 'auto',
  };
}

export async function normalizeTaskExecutionSettings(args: {
  projectId: string;
  currentTask?: DbRecord | null;
  updates: DbRecord;
  isCreate?: boolean;
}): Promise<{ updates: DbRecord; selection: ResolvedTaskExecutionSelection | null }> {
  const { projectId, currentTask = null, updates, isCreate = false } = args;
  const normalizedUpdates: DbRecord = { ...updates };
  if ('provider_config_id' in normalizedUpdates) normalizedUpdates.provider_config_id = nullableString(normalizedUpdates.provider_config_id);
  if ('provider_model' in normalizedUpdates) normalizedUpdates.provider_model = nullableString(normalizedUpdates.provider_model);

  if (!isCreate && !hasTaskExecutionSettingChanges(normalizedUpdates)) {
    return { updates: normalizedUpdates, selection: null };
  }

  if (isTaskExecutionLocked(currentTask) && hasTaskExecutionSettingChanges(normalizedUpdates)) {
    throw new Error('Execution settings are locked after the task has started. Reset the task to change the flow, provider, model, reasoning, or subagents.');
  }

  const effectiveTask = mergeTaskView(currentTask, normalizedUpdates);
  const selection = await resolveTaskExecutionSelection(projectId, effectiveTask);

  if (!selection.taskSelectionEnabled) {
    normalizedUpdates.provider_config_id = null;
    normalizedUpdates.provider_model = null;
    normalizedUpdates.effort = 'low';
    normalizedUpdates.multiagent = 'auto';
    return { updates: normalizedUpdates, selection };
  }

  normalizedUpdates.provider_config_id = selection.providerConfig?.id || null;
  normalizedUpdates.provider_model = selection.flowCapabilities.modelSelectable ? selection.providerModel : null;
  normalizedUpdates.effort = selection.normalizedEffort;
  normalizedUpdates.multiagent = selection.normalizedMultiagent;
  return { updates: normalizedUpdates, selection };
}

export async function materializeFlowSnapshotForTask(
  projectId: string,
  task: DbRecord,
  flowSnapshot: FlowConfig,
): Promise<FlowConfig> {
  if (flowSnapshot.steps.every(step => typeof step.provider_config_id === 'string' && step.provider_config_id.length > 0)) {
    return flowSnapshot;
  }

  if (isTaskSelectedFlow(flowSnapshot.provider_binding)) {
    const selection = await resolveTaskExecutionSelection(projectId, task);
    if (!selection.taskSelectionEnabled || !selection.providerConfig) {
      throw new Error('This flow requires a task-selected provider before execution can start');
    }
    return {
      ...flowSnapshot,
      steps: flowSnapshot.steps.map(step => ({
        ...step,
        model: formatModelId(selection.providerConfig.provider, resolveTaskSelectedStepModel(
          selection.providerConfig.task_config,
          step.model,
          selection.providerModel,
        )),
        provider_config_id: selection.providerConfig.id,
      })),
    };
  }

  const resolvedSteps = await resolveFlowStepProviderConfigs(projectId, flowSnapshot.provider_binding, flowSnapshot.steps);
  const materializedSteps = resolvedSteps.map((step) => {
    const parsed = parseModelId(step.model);
    return {
      ...step,
      model: formatModelId(parsed.provider, parsed.model),
    };
  });

  return {
    ...flowSnapshot,
    steps: materializedSteps,
  };
}

export async function resolveFreshFlowSnapshotForTask(args: {
  projectId: string;
  task: DbRecord;
}): Promise<{
  flowId: string;
  flowSnapshot: FlowConfig;
  firstPhase: string;
  maxAttempts: number;
}> {
  const flowId = nullableString(args.task.flow_id);
  if (!flowId) {
    throw new Error('AI tasks require an assigned flow');
  }
  const resolved = await resolveFlowForTask({
    flow_id: flowId,
  }, args.projectId);

  return {
    flowId: resolved.flowId,
    flowSnapshot: await materializeFlowSnapshotForTask(args.projectId, args.task, resolved.flowSnapshot),
    firstPhase: resolved.firstPhase,
    maxAttempts: resolved.maxAttempts,
  };
}
