import { describe, expect, it } from 'vitest';
import { defaultRuntimeIdForKind, normalizeRuntimeId, normalizeRuntimeKind } from './ai-runtimes';

describe('ai runtime normalization', () => {
  it('falls back to coding when a runtime kind has no implemented runtimes yet', () => {
    expect(normalizeRuntimeKind('image', 'coding')).toBe('coding');
  });

  it('falls back to the default runtime for the resolved kind when the runtime id does not match', () => {
    expect(normalizeRuntimeId('unknown-runtime', 'coding')).toBe(defaultRuntimeIdForKind('coding'));
    expect(normalizeRuntimeId('claude_code', 'image')).toBe(defaultRuntimeIdForKind('coding'));
  });
});
