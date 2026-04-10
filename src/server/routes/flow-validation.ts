const MAX_FLOW_STEPS = 50;

export function validateOptionalString(value: unknown, label: string, allowNull = false): string | null {
  if (value === undefined || (allowNull && value === null)) return null;
  return typeof value === 'string' ? null : `${label} must be a string`;
}

export function validateStepPayload(steps: unknown): string | null {
  if (steps === undefined) return null;
  if (!Array.isArray(steps)) return 'steps must be an array';
  if (steps.length > MAX_FLOW_STEPS) return `steps cannot exceed ${MAX_FLOW_STEPS} items`;
  for (const step of steps) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return 'each step must be an object';
  }
  return null;
}
