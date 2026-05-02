import { describe, expect, it } from 'vitest';
import {
  AI_RUNTIME_DEFINITIONS,
  AVAILABLE_AI_RUNTIMES,
  CODING_RUNTIME_OPTIONS,
  IMAGE_RUNTIME_OPTIONS,
  defaultRuntimeForKind,
  defaultRuntimeIdForKind,
  defaultVariantForRuntime,
  getAiRuntime,
  getAvailableAiRuntime,
  normalizeRuntimeId,
  normalizeRuntimeKind,
  normalizeRuntimeVariant,
  runtimeVariantOptions,
  supportsEffortControl,
  supportsMultiagent,
} from './ai-runtimes';

describe('static definitions', () => {
  it('includes all implemented runtimes', () => {
    expect(AVAILABLE_AI_RUNTIMES.map(r => r.id).sort()).toEqual(['claude_code', 'codex', 'gemma_code', 'qwen_code']);
  });

  it('all current runtimes are coding kind', () => {
    expect(CODING_RUNTIME_OPTIONS).toEqual(AVAILABLE_AI_RUNTIMES);
    expect(IMAGE_RUNTIME_OPTIONS).toEqual([]);
  });

  it('every runtime has a non-empty command and at least one variant', () => {
    for (const runtime of AI_RUNTIME_DEFINITIONS) {
      expect(runtime.command.length).toBeGreaterThan(0);
      expect(runtime.variantOptions.length).toBeGreaterThan(0);
      expect(runtime.defaultVariant).toBeTruthy();
    }
  });
});

describe('getAiRuntime', () => {
  it('returns a runtime definition by id', () => {
    expect(getAiRuntime('codex')?.label).toBe('Codex');
  });

  it('returns null for unknown id', () => {
    expect(getAiRuntime('nope')).toBeNull();
  });

  it('returns null for null / undefined / empty', () => {
    expect(getAiRuntime(null)).toBeNull();
    expect(getAiRuntime(undefined)).toBeNull();
    expect(getAiRuntime('')).toBeNull();
  });
});

describe('getAvailableAiRuntime', () => {
  it('returns implemented runtimes', () => {
    expect(getAvailableAiRuntime('claude_code')?.id).toBe('claude_code');
  });

  it('returns null for unknown runtime', () => {
    expect(getAvailableAiRuntime('unknown')).toBeNull();
  });
});

describe('helpers', () => {
  it('defaultRuntimeForKind returns the first available for a kind', () => {
    expect(defaultRuntimeForKind('coding')?.id).toBe('claude_code');
    expect(defaultRuntimeForKind('image')).toBeNull();
  });

  it('defaultVariantForRuntime returns the default variant', () => {
    expect(defaultVariantForRuntime('claude_code')).toBe('opus');
    expect(defaultVariantForRuntime('unknown')).toBeNull();
    expect(defaultVariantForRuntime(null)).toBeNull();
  });

  it('runtimeVariantOptions returns the variant list', () => {
    expect(runtimeVariantOptions('codex').map(v => v.id)).toContain('gpt-5.4');
    expect(runtimeVariantOptions('unknown')).toEqual([]);
  });

  it('supportsEffortControl returns true only for supporting runtimes', () => {
    expect(supportsEffortControl('claude_code')).toBe(true);
    expect(supportsEffortControl('qwen_code')).toBe(false);
    expect(supportsEffortControl('gemma_code')).toBe(false);
    expect(supportsEffortControl(null)).toBe(false);
  });

  it('supportsMultiagent returns true only for claude_code', () => {
    expect(supportsMultiagent('claude_code')).toBe(true);
    expect(supportsMultiagent('codex')).toBe(false);
    expect(supportsMultiagent('gemma_code')).toBe(false);
    expect(supportsMultiagent(null)).toBe(false);
  });
});

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
    expect(normalizeRuntimeVariant('codex', null)).toBe('gpt-5.4');
    expect(normalizeRuntimeVariant('qwen_code', null)).toBe('qwen3.6:35b-a3b-q4_K_M');
    expect(normalizeRuntimeVariant('gemma_code', null)).toBe('gemma4:e4b');
  });

  it('preserves a valid variant choice', () => {
    expect(normalizeRuntimeVariant('codex', 'gpt-5.3-codex')).toBe('gpt-5.3-codex');
    expect(normalizeRuntimeVariant('qwen_code', 'qwen3-coder')).toBe('qwen3-coder');
    expect(normalizeRuntimeVariant('gemma_code', 'gemma4:26b')).toBe('gemma4:26b');
  });

  it('falls back to the default variant when the variant is not in the runtime options', () => {
    expect(normalizeRuntimeVariant('codex', 'gpt-999')).toBe('gpt-5.4');
    expect(normalizeRuntimeVariant('qwen_code', 'qwen-unknown')).toBe('qwen3.6:35b-a3b-q4_K_M');
    expect(normalizeRuntimeVariant('gemma_code', 'gemma-unknown')).toBe('gemma4:e4b');
  });

  it('normalizeRuntimeId preserves a valid runtime id that matches the kind', () => {
    expect(normalizeRuntimeId('codex', 'coding')).toBe('codex');
    expect(normalizeRuntimeId('qwen_code', 'coding')).toBe('qwen_code');
    expect(normalizeRuntimeId('gemma_code', 'coding')).toBe('gemma_code');
  });

  it('normalizeRuntimeKind returns coding for valid coding kind', () => {
    expect(normalizeRuntimeKind('coding')).toBe('coding');
  });

  it('normalizeRuntimeVariant passes through raw variant when runtime is unknown', () => {
    expect(normalizeRuntimeVariant('unknown', 'custom-model')).toBe('custom-model');
    expect(normalizeRuntimeVariant(null, 'custom-model')).toBe('custom-model');
  });

  it('normalizeRuntimeVariant trims whitespace and falls back to default for empty', () => {
    expect(normalizeRuntimeVariant('codex', '  ')).toBe('gpt-5.4');
    expect(normalizeRuntimeVariant('codex', '')).toBe('gpt-5.4');
  });
});
