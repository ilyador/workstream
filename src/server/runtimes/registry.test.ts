import { describe, it, expect, vi } from 'vitest';
import type { RuntimeDriver } from './types.js';

vi.mock('../ai-runtime-discovery.js', () => ({
  requireDetectedAiRuntime: vi.fn((id: string) => ({ id, available: true, label: id })),
}));

const claudeExecute = vi.fn().mockResolvedValue('claude-result');
const codexExecute = vi.fn().mockResolvedValue('codex-result');
const qwenExecute = vi.fn().mockResolvedValue('qwen-result');
const gemmaExecute = vi.fn().mockResolvedValue('gemma-result');

const claudeSummarize = vi.fn().mockResolvedValue('claude-summary');
const codexSummarize = vi.fn().mockResolvedValue('codex-summary');
const qwenSummarize = vi.fn().mockResolvedValue('qwen-summary');
const gemmaSummarize = vi.fn().mockResolvedValue('gemma-summary');

vi.mock('./claude-driver.js', () => ({
  claudeDriver: { id: 'claude_code', execute: claudeExecute, summarize: claudeSummarize } as RuntimeDriver,
}));
vi.mock('./codex-driver.js', () => ({
  codexDriver: { id: 'codex', execute: codexExecute, summarize: codexSummarize } as RuntimeDriver,
}));
vi.mock('./qwen-driver.js', () => ({
  qwenDriver: { id: 'qwen_code', execute: qwenExecute, summarize: qwenSummarize } as RuntimeDriver,
}));
vi.mock('./gemma-driver.js', () => ({
  gemmaDriver: { id: 'gemma_code', execute: gemmaExecute, summarize: gemmaSummarize } as RuntimeDriver,
}));

function stepWithRuntime(runtime_id: string) {
  return {
    id: 's1',
    name: 'step',
    runtime_kind: 'coding',
    runtime_id,
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('registry', () => {
  it('dispatches executeFlowStep to claudeDriver for claude_code', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('claude_code'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('claude-result');
    expect(claudeExecute).toHaveBeenCalled();
  });

  it('dispatches executeFlowStep to codexDriver for codex', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('codex'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('codex-result');
    expect(codexExecute).toHaveBeenCalled();
  });

  it('dispatches executeFlowStep to qwenDriver for qwen_code', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('qwen_code'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('qwen-result');
    expect(qwenExecute).toHaveBeenCalled();
  });

  it('dispatches executeFlowStep to gemmaDriver for gemma_code', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('gemma_code'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('gemma-result');
    expect(gemmaExecute).toHaveBeenCalled();
  });

  it('dispatches summarize to the correct driver', async () => {
    const { summarize } = await import('./registry.js');
    await expect(summarize({
      jobId: 'j1',
      step: stepWithRuntime('claude_code'),
      cwd: '/work',
      prompt: 'p',
    })).resolves.toBe('claude-summary');
    await expect(summarize({
      jobId: 'j1',
      step: stepWithRuntime('codex'),
      cwd: '/work',
      prompt: 'p',
    })).resolves.toBe('codex-summary');
    await expect(summarize({
      jobId: 'j1',
      step: stepWithRuntime('gemma_code'),
      cwd: '/work',
      prompt: 'p',
    })).resolves.toBe('gemma-summary');
  });

  it('throws when the step runtime_id has no registered driver', async () => {
    const { executeFlowStep } = await import('./registry.js');
    await expect(executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('unknown_runtime'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    })).rejects.toThrow(/Runtime driver not registered/);
  });
});
