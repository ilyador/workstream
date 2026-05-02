import type { AiRuntimeId } from '../../shared/ai-runtimes.js';
import { requireDetectedAiRuntime } from '../ai-runtime-discovery.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { claudeDriver } from './claude-driver.js';
import { codexDriver } from './codex-driver.js';
import { qwenDriver } from './qwen-driver.js';
import { gemmaDriver } from './gemma-driver.js';

const drivers = new Map<AiRuntimeId, RuntimeDriver>([
  ['claude_code', claudeDriver],
  ['codex', codexDriver],
  ['qwen_code', qwenDriver],
  ['gemma_code', gemmaDriver],
]);

function resolveDriver(runtimeId: string): RuntimeDriver {
  requireDetectedAiRuntime(runtimeId);
  const driver = drivers.get(runtimeId as AiRuntimeId);
  if (!driver) {
    throw new Error(`Runtime driver not registered: ${runtimeId}`);
  }
  return driver;
}

export async function executeFlowStep(opts: ExecuteStepOptions): Promise<string> {
  return resolveDriver(opts.step.runtime_id).execute(opts);
}

export async function summarize(opts: SummarizeOptions): Promise<string> {
  return resolveDriver(opts.step.runtime_id).summarize(opts);
}
