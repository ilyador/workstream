import type { AiRuntimeId } from '../../shared/ai-runtimes.js';
import type { FlowStepConfig } from '../flow-config.js';

export interface ExecuteStepOptions {
  jobId: string;
  step: FlowStepConfig;
  task: { effort?: string | null };
  cwd: string;
  prompt: string;
  onLog: (text: string) => void;
  timeoutMs?: number;
}

export interface SummarizeOptions {
  jobId: string;
  step: FlowStepConfig;
  cwd: string;
  prompt: string;
}

export interface RuntimeDriver {
  readonly id: AiRuntimeId;
  execute(opts: ExecuteStepOptions): Promise<string>;
  summarize(opts: SummarizeOptions): Promise<string>;
}
