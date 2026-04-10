import type { Flow, FlowStep } from './api';
import type { TaskView, WorkstreamView } from './task-view';
import type { TaskCardMetaItem } from '../components/task-card-types';
import { defaultRuntimeIdForKind, defaultVariantForRuntime } from '../../shared/ai-runtimes.js';

export type FlowStepInput = Omit<FlowStep, 'id'>;

export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function makeBlankStep(position: number): FlowStep {
  const runtimeId = defaultRuntimeIdForKind('coding');
  return {
    id: `new-${Date.now()}-${position}`,
    name: '',
    position,
    instructions: '',
    runtime_kind: 'coding',
    runtime_id: runtimeId,
    runtime_variant: defaultVariantForRuntime(runtimeId),
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'],
    context_sources: ['agents', 'task_description'],
    use_project_data: false,
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
    runtime_kind: step.runtime_kind,
    runtime_id: step.runtime_id,
    runtime_variant: step.runtime_variant,
    tools: step.tools,
    context_sources: step.context_sources,
    use_project_data: step.use_project_data,
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

export function stepToTask(step: FlowStep, index: number): TaskView {
  return {
    id: step.id,
    title: step.name || `Step ${index + 1}`,
    description: step.instructions || undefined,
    type: step.runtime_variant || step.runtime_id,
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

export function getStepMetaItems(step: FlowStep): TaskCardMetaItem[] {
  return [
    { label: 'runtime', value: step.runtime_id },
    ...(step.runtime_variant ? [{ label: 'variant', value: step.runtime_variant }] : []),
    { label: 'tools', value: step.tools.join(', ') },
    ...(step.use_project_data ? [{ label: 'project data', value: 'on' }] : []),
    ...(step.is_gate ? [{ label: 'gate', value: `max ${step.max_retries} retries, then ${step.on_max_retries}` }] : []),
  ];
}
