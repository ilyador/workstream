import { validateTaskSelectedStepModels, type FlowCapabilityStep } from '../../shared/flow-execution-capabilities.js';
import { parseTaskModelSelector } from '../../shared/flow-step-model.js';

const MAX_FLOW_STEPS = 50;
const FLOW_PROVIDER_BINDINGS = new Set(['task_selected', 'flow_locked']);

export function validateOptionalString(value: unknown, label: string, allowNull = false): string | null {
  if (value === undefined || (allowNull && value === null)) return null;
  return typeof value === 'string' ? null : `${label} must be a string`;
}

export function validateFlowProviderBinding(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === 'string' && FLOW_PROVIDER_BINDINGS.has(value)
    ? null
    : 'provider_binding must be "task_selected" or "flow_locked"';
}

export function validateStepPayload(steps: unknown): string | null {
  if (steps === undefined) return null;
  if (!Array.isArray(steps)) return 'steps must be an array';
  if (steps.length > MAX_FLOW_STEPS) return `steps cannot exceed ${MAX_FLOW_STEPS} items`;
  return null;
}

export function validateStepsForBinding(binding: string | null | undefined, steps: readonly FlowCapabilityStep[]): string | null {
  for (const step of steps) {
    if (!(step.model || '').trim()) {
      return 'Each step requires a model.';
    }
  }

  if (binding === 'task_selected') {
    return validateTaskSelectedStepModels(steps);
  }

  for (const step of steps) {
    const selector = parseTaskModelSelector(step.model);
    if (selector) {
      return `Flow-locked steps must use concrete provider models such as claude:sonnet or codex:gpt-5.4. Received '${step.model}'.`;
    }
  }

  return null;
}
