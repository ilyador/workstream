export type AiRuntimeKind = 'coding' | 'image';

export type AiRuntimeId = 'claude_code' | 'codex' | 'qwen_code' | 'gemma_code';

export interface RuntimeVariantOption {
  id: string;
  label: string;
}

export interface AiRuntimeDefinition {
  id: AiRuntimeId;
  kind: AiRuntimeKind;
  label: string;
  description: string;
  command: string;
  implemented: boolean;
  supportsTools: boolean;
  supportsEffortControl: boolean;
  supportsMultiagent: boolean;
  variantOptions: RuntimeVariantOption[];
  defaultVariant: string | null;
}

export interface AiRuntimeStatus extends AiRuntimeDefinition {
  available: boolean;
  detectedPath: string | null;
}

export const AI_RUNTIME_DEFINITIONS: AiRuntimeDefinition[] = [
  {
    id: 'claude_code',
    kind: 'coding',
    label: 'Claude Code',
    description: 'Terminal coding agent with file and shell tools.',
    command: 'claude',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: true,
    supportsMultiagent: true,
    variantOptions: [
      { id: 'opus', label: 'Opus' },
      { id: 'sonnet', label: 'Sonnet' },
    ],
    defaultVariant: 'opus',
  },
  {
    id: 'codex',
    kind: 'coding',
    label: 'Codex',
    description: 'OpenAI Codex CLI coding agent with file and shell tools.',
    command: 'codex',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: true,
    supportsMultiagent: false,
    variantOptions: [
      { id: 'gpt-5.4', label: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { id: 'gpt-5.2', label: 'GPT-5.2' },
    ],
    defaultVariant: 'gpt-5.4',
  },
  {
    id: 'qwen_code',
    kind: 'coding',
    label: 'Qwen Code',
    description: 'Qwen Code CLI coding agent with file and shell tools.',
    command: 'qwen',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: false,
    supportsMultiagent: false,
    variantOptions: [
      { id: 'qwen3.6:35b-a3b-q4_K_M', label: 'Qwen 3.6 35B' },
      { id: 'qwen3-coder', label: 'Qwen3 Coder' },
    ],
    defaultVariant: 'qwen3.6:35b-a3b-q4_K_M',
  },
  {
    id: 'gemma_code',
    kind: 'coding',
    label: 'Gemma Code',
    description: 'Local Gemma 4 coding agent backed by Ollama tool calls.',
    command: 'ollama',
    implemented: true,
    supportsTools: true,
    supportsEffortControl: false,
    supportsMultiagent: false,
    variantOptions: [
      { id: 'gemma4:e2b', label: 'Gemma 4 E2B' },
      { id: 'gemma4:e4b', label: 'Gemma 4 E4B' },
      { id: 'gemma4:26b', label: 'Gemma 4 26B' },
      { id: 'gemma4:31b', label: 'Gemma 4 31B' },
    ],
    defaultVariant: 'gemma4:e4b',
  },
];

export const AVAILABLE_AI_RUNTIMES = AI_RUNTIME_DEFINITIONS.filter(runtime => runtime.implemented);

export const CODING_RUNTIME_OPTIONS = AVAILABLE_AI_RUNTIMES.filter(runtime => runtime.kind === 'coding');
export const IMAGE_RUNTIME_OPTIONS = AVAILABLE_AI_RUNTIMES.filter(runtime => runtime.kind === 'image');

export function getAiRuntime(id: string | null | undefined): AiRuntimeDefinition | null {
  if (!id) return null;
  return AI_RUNTIME_DEFINITIONS.find(runtime => runtime.id === id) ?? null;
}

export function getAvailableAiRuntime(id: string | null | undefined): AiRuntimeDefinition | null {
  const runtime = getAiRuntime(id);
  return runtime?.implemented ? runtime : null;
}

export function defaultRuntimeForKind(kind: AiRuntimeKind): AiRuntimeDefinition | null {
  return AVAILABLE_AI_RUNTIMES.find(runtime => runtime.kind === kind) ?? null;
}

export function defaultRuntimeIdForKind(kind: AiRuntimeKind): string {
  return defaultRuntimeForKind(kind)?.id
    ?? defaultRuntimeForKind('coding')?.id
    ?? AI_RUNTIME_DEFINITIONS[0]?.id
    ?? '';
}

export function defaultVariantForRuntime(runtimeId: string | null | undefined): string | null {
  return getAiRuntime(runtimeId)?.defaultVariant ?? null;
}

export function runtimeVariantOptions(runtimeId: string | null | undefined): RuntimeVariantOption[] {
  return getAiRuntime(runtimeId)?.variantOptions ?? [];
}

export function supportsEffortControl(runtimeId: string | null | undefined): boolean {
  return getAiRuntime(runtimeId)?.supportsEffortControl === true;
}

export function supportsMultiagent(runtimeId: string | null | undefined): boolean {
  return getAiRuntime(runtimeId)?.supportsMultiagent === true;
}

export function normalizeRuntimeKind(value: unknown, fallback: AiRuntimeKind = 'coding'): AiRuntimeKind {
  const normalized = value === 'coding' || value === 'image' ? value : fallback;
  return defaultRuntimeForKind(normalized) ? normalized : fallback;
}

export function normalizeRuntimeId(
  runtimeId: unknown,
  runtimeKind: AiRuntimeKind = 'coding',
): string {
  const resolvedKind = normalizeRuntimeKind(runtimeKind, 'coding');
  if (typeof runtimeId === 'string') {
    const runtime = getAiRuntime(runtimeId);
    if (runtime?.kind === resolvedKind) return runtimeId;
  }
  return defaultRuntimeIdForKind(resolvedKind);
}

export function normalizeRuntimeVariant(runtimeId: unknown, runtimeVariant: unknown): string | null {
  const resolvedRuntimeId = typeof runtimeId === 'string' ? runtimeId : null;
  const runtime = getAiRuntime(resolvedRuntimeId);
  const value = typeof runtimeVariant === 'string' && runtimeVariant.trim() ? runtimeVariant.trim() : null;
  if (!runtime) return value;
  if (!value) return runtime.defaultVariant;
  return runtime.variantOptions.some(option => option.id === value) ? value : runtime.defaultVariant;
}
