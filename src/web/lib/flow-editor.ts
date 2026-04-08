import type { Flow, FlowStep } from './api';
import type { TaskView, WorkstreamView } from './task-view';
import type { TaskCardMetaItem } from '../components/task-card-types';
import { isTaskSelectedFlow } from '../../shared/flow-provider-binding';
import { describeTaskStepModel } from '../../shared/flow-step-model';

export type FlowStepInput = Omit<FlowStep, 'id'>;

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function makeBlankStep(position: number, providerBinding: Flow['provider_binding'] = 'flow_locked'): FlowStep {
  return {
    id: `new-${Date.now()}-${position}`,
    name: '',
    position,
    instructions: '',
    model: isTaskSelectedFlow(providerBinding) ? 'task:selected' : 'claude:sonnet',
    provider_config_id: null,
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    context_sources: ['agents', 'task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 1,
    on_max_retries: 'pause',
  };
}

export function stepsPayload(steps: FlowStep[]): FlowStepInput[] {
  return steps.map((step, index) => ({
    name: step.name.trim() || `Step ${index + 1}`,
    position: index + 1,
    instructions: step.instructions,
    model: step.model,
    provider_config_id: step.provider_config_id ?? null,
    tools: step.tools,
    context_sources: step.context_sources,
    is_gate: step.is_gate,
    on_fail_jump_to: step.is_gate ? step.on_fail_jump_to : null,
    max_retries: step.is_gate ? step.max_retries : 0,
    on_max_retries: step.is_gate ? step.on_max_retries : 'pause',
  }));
}

export function sortedSteps(flow: Flow): FlowStep[] {
  return flow.flow_steps
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(step => ({
      ...step,
      tools: [...step.tools],
      context_sources: [...step.context_sources],
    }));
}

export function stepToTask(step: FlowStep, index: number, flow: Pick<Flow, 'provider_binding'>): TaskView {
  return {
    id: step.id,
    title: step.name || `Step ${index + 1}`,
    description: step.instructions || undefined,
    type: isTaskSelectedFlow(flow.provider_binding) ? describeTaskStepModel(step.model) : step.model,
    mode: 'ai',
    effort: '',
    auto_continue: true,
    status: 'backlog',
  };
}

export function flowToWorkstream(flow: Flow): WorkstreamView {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description || '',
    has_code: false,
    status: 'open',
    position: flow.position ?? 0,
  };
}

export function getStepMetaItems(step: FlowStep, flow: Pick<Flow, 'provider_binding'>): TaskCardMetaItem[] {
  return [
    isTaskSelectedFlow(flow.provider_binding)
      ? { label: 'profile', value: describeTaskStepModel(step.model) }
      : { label: 'model', value: step.model },
    { label: 'tools', value: step.tools.join(', ') },
    ...(step.is_gate ? [{ label: 'gate', value: `max ${step.max_retries} retries, then ${step.on_max_retries}` }] : []),
  ];
}
