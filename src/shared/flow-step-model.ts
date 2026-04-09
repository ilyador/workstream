import {
  defaultModelForProvider,
  parseModelId,
  type ProviderKind,
} from './provider-model';

export type TaskModelProfile = 'selected' | 'balanced' | 'strong';

export interface TaskModelProfileOption {
  value: TaskModelProfile;
  label: string;
  description: string;
}

export const TASK_MODEL_PROFILE_OPTIONS: TaskModelProfileOption[] = [
  {
    value: 'selected',
    label: 'Task model',
    description: 'Use the task-level model, if this flow supports model selection.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Use a general-purpose model profile for standard steps.',
  },
  {
    value: 'strong',
    label: 'Strong',
    description: 'Use the strongest coding model profile for the selected provider.',
  },
];

const CLAUDE_MODEL_PROFILES: Record<Exclude<TaskModelProfile, 'selected'>, string> = {
  balanced: 'sonnet',
  strong: 'opus',
};

const CODEX_MODEL_PROFILES: Record<Exclude<TaskModelProfile, 'selected'>, string> = {
  balanced: 'gpt-5.4-mini',
  strong: 'gpt-5.4',
};

const STRONG_MODEL_IDS = new Set([
  'claude:opus',
  'codex:gpt-5.4',
  'codex:gpt-5.3-codex',
  'codex:gpt-5.2-codex',
  'codex:gpt-5.1-codex-max',
  'codex:gpt-5-codex',
  'codex:o3',
]);

const BALANCED_MODEL_IDS = new Set([
  'claude:sonnet',
  'codex:gpt-5.4-mini',
  'codex:gpt-5.1-codex',
  'codex:gpt-5.2',
]);

export function formatTaskModelSelector(profile: TaskModelProfile): string {
  return `task:${profile}`;
}

export function parseTaskModelSelector(value: string | null | undefined): TaskModelProfile | null {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed.startsWith('task:')) return null;
  switch (trimmed.slice('task:'.length)) {
    case 'selected':
      return 'selected';
    case 'fast':
      return 'balanced';
    case 'balanced':
    case 'strong':
      return trimmed.slice('task:'.length) as TaskModelProfile;
    default:
      return null;
  }
}

export function isTaskModelSelector(value: string | null | undefined): boolean {
  return parseTaskModelSelector(value) !== null;
}

export function inferTaskModelProfile(value: string | null | undefined): TaskModelProfile | null {
  if (!(value || '').trim()) return null;
  const selector = parseTaskModelSelector(value);
  if (selector) return selector;

  const parsed = parseModelId(value);
  const normalized = `${parsed.provider}:${parsed.model}`.toLowerCase();
  if (BALANCED_MODEL_IDS.has(normalized)) return 'balanced';
  if (STRONG_MODEL_IDS.has(normalized)) return 'strong';
  return null;
}

export function isTaskSelectableStepModel(value: string | null | undefined): boolean {
  return inferTaskModelProfile(value) !== null;
}

export function supportsFlowWideModelSelection(stepModels: readonly string[]): boolean {
  return stepModels.every(model => inferTaskModelProfile(model) === 'selected');
}

export function defaultModelForProfile(
  provider: ProviderKind,
  profile: Exclude<TaskModelProfile, 'selected'>,
): string {
  switch (provider) {
    case 'claude':
      return CLAUDE_MODEL_PROFILES[profile];
    case 'codex':
      return CODEX_MODEL_PROFILES[profile];
    default:
      return defaultModelForProvider(provider);
  }
}

export function resolveTaskSelectedStepModel(
  provider: ProviderKind,
  stepModel: string,
  taskModel: string | null = null,
): string {
  const profile = inferTaskModelProfile(stepModel);
  if (!profile) {
    throw new Error(`Task-selected flow step '${stepModel}' does not map to a provider-agnostic model selector`);
  }
  if (profile === 'selected') {
    return taskModel?.trim() || defaultModelForProvider(provider);
  }
  return defaultModelForProfile(provider, profile);
}

export function describeTaskStepModel(value: string | null | undefined): string {
  const profile = inferTaskModelProfile(value);
  switch (profile) {
    case 'selected':
      return 'task model';
    case 'balanced':
      return 'balanced profile';
    case 'strong':
      return 'strong profile';
    default:
      return (value || '').trim() || 'unknown';
  }
}
