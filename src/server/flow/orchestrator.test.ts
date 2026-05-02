import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockReturnThis(),
    })),
  },
}));

vi.mock('../git-utils.js', () => ({
  stagedDiffStat: vi.fn().mockReturnValue({ filesChanged: 0, linesAdded: 0, linesRemoved: 0, changedFiles: [] }),
  repositoryChangeFingerprint: vi.fn().mockReturnValue(''),
}));

vi.mock('../runtimes/index.js', () => ({
  executeFlowStep: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('./prompt-builder.js', () => ({
  buildStepPrompt: vi.fn().mockResolvedValue('prompt'),
}));

import { __test__ } from './orchestrator.js';
const { detectPauseQuestion, checkGate, stepTimeoutMs, gateJumpLimitForTarget, stepRequiresRepositoryChange } = __test__;

function baseStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    name: 'Code',
    runtime_kind: 'coding',
    runtime_id: 'claude_code',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    max_retries: 0,
    is_gate: false,
    on_fail_jump_to: null,
    on_max_retries: 'fail',
    position: 0,
    instructions: 'Do it',
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('detectPauseQuestion', () => {
  it('returns the inline question after an explicit pause marker', () => {
    const output = 'I checked the tests.\n[pause] Should I treat this unrelated failure as blocking?';
    expect(detectPauseQuestion(output)).toBe('Should I treat this unrelated failure as blocking?');
  });

  it('returns a block question after an explicit pause marker', () => {
    const output = 'I checked the tests.\n[pause]\nShould I treat this unrelated failure as blocking?\nIt appears unrelated.';
    expect(detectPauseQuestion(output)).toBe('Should I treat this unrelated failure as blocking?\nIt appears unrelated.');
  });

  it('ignores text after the summary marker', () => {
    const output = '[pause] Should I pause here?\n[summary] Asked for user input\n[pause] ignored';
    expect(detectPauseQuestion(output)).toBe('Should I pause here?');
  });

  it('returns null when there is no explicit pause marker', () => {
    expect(detectPauseQuestion('work done.\nAll tests pass.')).toBeNull();
  });

  it('returns null for unmarked clarification questions', () => {
    const output = 'Before I begin, should I put this in Board.tsx or a new component?';
    expect(detectPauseQuestion(output)).toBeNull();
  });

  it('returns null for an empty pause marker', () => {
    const output = 'work done\n[pause]\n[summary] no question';
    expect(detectPauseQuestion(output)).toBeNull();
  });
});

describe('checkGate', () => {
  it('uses the parsed verdict when present (failing case)', () => {
    const output = '```json\n{"passed": false, "reason": "tests fail"}\n```';
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, output)).toEqual({ failed: true, reason: 'tests fail' });
  });

  it('uses the parsed verdict when present (passing case)', () => {
    const output = '```json\n{"passed": true, "reason": "all good"}\n```';
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, output)).toEqual({ failed: false, reason: 'all good' });
  });

  it('falls back to legacyVerifyCheck when no verdict and step name is verify', () => {
    const step = baseStep({ name: 'verify' });
    expect(checkGate(step, '3 tests fail').failed).toBe(true);
    expect(checkGate(step, 'all tests passed').failed).toBe(false);
  });

  it('falls back to legacyReviewCheck when no verdict and step name is review', () => {
    const step = baseStep({ name: 'review' });
    expect(checkGate(step, 'issues found').failed).toBe(true);
    expect(checkGate(step, 'no issues found').failed).toBe(false);
  });

  it('uses legacyReviewCheck when context_sources includes review_criteria', () => {
    const step = baseStep({ name: 'custom_gate', context_sources: ['review_criteria'] });
    expect(checkGate(step, 'issues found').failed).toBe(true);
  });

  it('returns a synthesized reason containing the step name when no verdict reason is present', () => {
    const step = baseStep({ name: 'verify' });
    const result = checkGate(step, '3 tests fail');
    expect(result.failed).toBe(true);
    expect(result.reason).toContain('verify');
  });
});

describe('stepTimeoutMs', () => {
  it('uses the default step timeout for non-Qwen steps', () => {
    const step = baseStep({ runtime_id: 'claude_code' });
    expect(stepTimeoutMs(step)).toBe(45 * 60 * 1000);
  });

  it('uses the default timeout for Qwen steps', () => {
    const step = baseStep({ runtime_id: 'qwen_code' });
    expect(stepTimeoutMs(step)).toBe(60 * 60 * 1000);
  });

  it('allows Qwen timeout override from the environment', () => {
    const previous = process.env.WORKSTREAM_QWEN_STEP_TIMEOUT_MINUTES;
    process.env.WORKSTREAM_QWEN_STEP_TIMEOUT_MINUTES = '75';
    try {
      const step = baseStep({ runtime_id: 'qwen_code' });
      expect(stepTimeoutMs(step)).toBe(75 * 60 * 1000);
    } finally {
      if (previous === undefined) delete process.env.WORKSTREAM_QWEN_STEP_TIMEOUT_MINUTES;
      else process.env.WORKSTREAM_QWEN_STEP_TIMEOUT_MINUTES = previous;
    }
  });

  it('allows default timeout override from the environment', () => {
    const previous = process.env.WORKSTREAM_STEP_TIMEOUT_MINUTES;
    process.env.WORKSTREAM_STEP_TIMEOUT_MINUTES = '30';
    try {
      const step = baseStep({ runtime_id: 'claude_code' });
      expect(stepTimeoutMs(step)).toBe(30 * 60 * 1000);
    } finally {
      if (previous === undefined) delete process.env.WORKSTREAM_STEP_TIMEOUT_MINUTES;
      else process.env.WORKSTREAM_STEP_TIMEOUT_MINUTES = previous;
    }
  });
});

describe('gateJumpLimitForTarget', () => {
  it('uses the short default jump-back limit for Gemma steps', () => {
    const step = baseStep({ runtime_id: 'gemma_code' });
    expect(gateJumpLimitForTarget(step)).toBe(2);
  });

  it('allows Gemma jump-back limit override from the environment', () => {
    const previous = process.env.WORKSTREAM_GEMMA_GATE_JUMP_LIMIT;
    process.env.WORKSTREAM_GEMMA_GATE_JUMP_LIMIT = '3';
    try {
      const step = baseStep({ runtime_id: 'gemma_code' });
      expect(gateJumpLimitForTarget(step)).toBe(3);
    } finally {
      if (previous === undefined) delete process.env.WORKSTREAM_GEMMA_GATE_JUMP_LIMIT;
      else process.env.WORKSTREAM_GEMMA_GATE_JUMP_LIMIT = previous;
    }
  });

  it('keeps the global jump-back limit for non-local runtimes', () => {
    const previous = process.env.WORKSTREAM_GATE_JUMP_LIMIT;
    process.env.WORKSTREAM_GATE_JUMP_LIMIT = '7';
    try {
      const step = baseStep({ runtime_id: 'claude_code' });
      expect(gateJumpLimitForTarget(step)).toBe(7);
    } finally {
      if (previous === undefined) delete process.env.WORKSTREAM_GATE_JUMP_LIMIT;
      else process.env.WORKSTREAM_GATE_JUMP_LIMIT = previous;
    }
  });
});

describe('stepRequiresRepositoryChange', () => {
  it('guards local mutating runtime steps', () => {
    expect(stepRequiresRepositoryChange(baseStep({ runtime_id: 'gemma_code', tools: ['Read', 'Edit'] }))).toBe(true);
    expect(stepRequiresRepositoryChange(baseStep({ runtime_id: 'qwen_code', tools: ['Write'] }))).toBe(true);
  });

  it('does not guard read-only, gate, or non-local steps', () => {
    expect(stepRequiresRepositoryChange(baseStep({ runtime_id: 'gemma_code', tools: ['Read', 'Grep'] }))).toBe(false);
    expect(stepRequiresRepositoryChange(baseStep({ runtime_id: 'gemma_code', tools: ['Edit'], is_gate: true }))).toBe(false);
    expect(stepRequiresRepositoryChange(baseStep({ runtime_id: 'claude_code', tools: ['Edit'] }))).toBe(false);
  });
});
