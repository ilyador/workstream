import { describe, expect, it } from 'vitest';
import { defaultRuntimeIdForKind, normalizeRuntimeId, normalizeRuntimeKind, normalizeRuntimeVariant } from './ai-runtimes';

describe('ai runtime normalization', () => {
  it('falls back to coding when a runtime kind has no implemented runtimes yet', () => {
    expect(normalizeRuntimeKind('image', 'coding')).toBe('coding');
  });

  it('falls back to the default runtime for the resolved kind when the runtime id does not match', () => {
    expect(normalizeRuntimeId('unknown-runtime', 'coding')).toBe(defaultRuntimeIdForKind('coding'));
    expect(normalizeRuntimeId('claude_code', 'image')).toBe(defaultRuntimeIdForKind('coding'));
  });

  it('applies the runtime default variant when no variant is provided', () => {
    expect(normalizeRuntimeVariant('claude_code', null)).toBe('opus');
    expect(normalizeRuntimeVariant('codex', null)).toBe('gpt-5-codex');
    expect(normalizeRuntimeVariant('qwen_code', null)).toBe('qwen3-coder-plus');
  });

  it('preserves a valid variant choice', () => {
    expect(normalizeRuntimeVariant('codex', 'gpt-5')).toBe('gpt-5');
    expect(normalizeRuntimeVariant('qwen_code', 'qwen3-coder')).toBe('qwen3-coder');
  });

  it('falls back to the default variant when the variant is not in the runtime options', () => {
    expect(normalizeRuntimeVariant('codex', 'gpt-999')).toBe('gpt-5-codex');
    expect(normalizeRuntimeVariant('qwen_code', 'qwen-unknown')).toBe('qwen3-coder-plus');
  });
});
