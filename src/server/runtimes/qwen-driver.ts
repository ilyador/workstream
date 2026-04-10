import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

function buildArgs(step: FlowStepConfig): string[] {
  const args = ['--output-format', 'text', '--approval-mode', 'yolo'];
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  return args;
}

export const qwenDriver: RuntimeDriver = {
  id: 'qwen_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'qwen',
      args: buildArgs(opts.step),
      cwd: opts.cwd,
      env: buildRuntimeEnv('qwen_code'),
      stdin: opts.prompt,
      onLine: (line, _stream) => {
        if (line.trim()) opts.onLog(`${line}\n`);
      },
      onLog: opts.onLog,
    });
    return result.stdout.trim() || 'Completed';
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'qwen',
      args: buildArgs(opts.step),
      cwd: opts.cwd,
      env: buildRuntimeEnv('qwen_code'),
      stdin: opts.prompt,
      timeoutMs: 60_000,
      onLine: () => {},
      onLog: () => {},
    });
    return result.stdout.trim() || 'Completed';
  },
};
