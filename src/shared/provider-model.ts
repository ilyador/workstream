export type ProviderKind = 'claude' | 'codex' | 'lmstudio' | 'ollama' | 'custom';

export type ReasoningLevel = 'low' | 'medium' | 'high' | 'max';
export type ProviderReasoningLevel = 'low' | 'medium' | 'high' | 'max' | 'xhigh';
export type MultiagentMode = 'auto' | 'yes';

export interface ParsedModelId {
  provider: ProviderKind;
  model: string;
  raw: string;
  isLegacy: boolean;
}

export function normalizeProviderKind(provider: string): ProviderKind {
  switch (provider) {
    case 'claude':
    case 'codex':
    case 'lmstudio':
    case 'ollama':
      return provider;
    default:
      return 'custom';
  }
}

export function defaultModelForProvider(provider: ProviderKind): string {
  switch (provider) {
    case 'claude':
      return 'sonnet';
    case 'codex':
      return 'gpt-5.4';
    default:
      return '';
  }
}

export function parseModelId(value: string | null | undefined): ParsedModelId {
  const raw = (value || '').trim();
  if (!raw) {
    return {
      provider: 'claude',
      model: defaultModelForProvider('claude'),
      raw: 'claude:sonnet',
      isLegacy: false,
    };
  }

  const splitAt = raw.indexOf(':');
  if (splitAt <= 0) {
    return {
      provider: 'claude',
      model: raw,
      raw: `claude:${raw}`,
      isLegacy: true,
    };
  }

  const provider = normalizeProviderKind(raw.slice(0, splitAt).trim().toLowerCase());
  const model = raw.slice(splitAt + 1).trim() || defaultModelForProvider(provider);
  return {
    provider,
    model,
    raw,
    isLegacy: false,
  };
}

export function formatModelId(provider: ProviderKind, model: string): string {
  const normalizedProvider = normalizeProviderKind(provider);
  const trimmed = model.trim();
  return `${normalizedProvider}:${trimmed || defaultModelForProvider(normalizedProvider)}`;
}

export function isCliProvider(provider: ProviderKind): boolean {
  return provider === 'claude' || provider === 'codex';
}

export function isApiProvider(provider: ProviderKind): boolean {
  return provider === 'lmstudio' || provider === 'ollama' || provider === 'custom';
}

export function isLocalApiProvider(provider: ProviderKind): boolean {
  return provider === 'lmstudio' || provider === 'ollama';
}

export function toProviderReasoningLevel(
  provider: ProviderKind,
  value: ReasoningLevel,
): ProviderReasoningLevel {
  if (provider === 'codex' && value === 'max') {
    return 'xhigh';
  }
  return value;
}
