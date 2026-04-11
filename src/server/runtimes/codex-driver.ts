import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

function codexEffortLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === 'max' ? 'xhigh' : value;
}

function allocateOutputPath(jobId: string, kind: 'step' | 'summary'): string {
  return join(tmpdir(), `workstream-codex-${kind}-${jobId}-${Date.now()}.txt`);
}

function buildArgs(
  step: FlowStepConfig,
  task: { effort?: string | null },
  cwd: string,
  outputPath: string,
): string[] {
  const trailing: string[] = [];
  if (step.runtime_variant) trailing.push('--model', step.runtime_variant);
  const effort = codexEffortLevel(task.effort);
  if (effort) trailing.push('-c', `model_reasoning_effort="${effort}"`);

  return [
    'exec',
    '--json',
    '--cd', cwd,
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-last-message', outputPath,
    ...trailing,
    '-',
  ];
}

function formatCodexEventBody(event: Record<string, unknown>): string | null {
  // Legacy shapes (older codex versions)
  if (typeof event.msg === 'string') return event.msg;
  if (typeof event.message === 'string') return event.message;
  if (typeof event.text === 'string') return event.text;

  const type = typeof event.type === 'string' ? event.type : null;

  // Codex v0.118+ wraps content in `item`: item_started / item_completed /
  // item.started / item.completed depending on build. The item carries type +
  // text/command.
  if (type && (type === 'item.completed' || type === 'item.started' || type === 'item_completed' || type === 'item_started')) {
    const item = event.item;
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      if (typeof rec.text === 'string' && rec.text.length > 0) return rec.text;
      if (typeof rec.command === 'string' && rec.command.length > 0) {
        const itemType = typeof rec.type === 'string' ? rec.type : type;
        return `[${itemType}] ${rec.command}`;
      }
    }
    return null;
  }

  // Turn completed: surface token usage as a short status line.
  if (type === 'turn.completed' || type === 'turn_completed') {
    const usage = event.usage;
    if (usage && typeof usage === 'object') {
      const u = usage as Record<string, unknown>;
      const inTok = typeof u.input_tokens === 'number' ? u.input_tokens : '?';
      const outTok = typeof u.output_tokens === 'number' ? u.output_tokens : '?';
      return `[codex] tokens: in=${inTok} out=${outTok}`;
    }
    return null;
  }

  // Quiet lifecycle events — drop silently.
  if (type === 'thread.started' || type === 'turn.started' || type === 'thread_started' || type === 'turn_started') {
    return null;
  }

  // Final fallback for older `[type] command` shape.
  if (type && typeof event.command === 'string') {
    return `[${type}] ${event.command}`;
  }

  return null;
}

async function runCodex(
  jobId: string,
  args: string[],
  outputPath: string,
  cwd: string,
  prompt: string,
  onLog: (text: string) => void,
  timeoutMs?: number,
): Promise<string> {
  let caught: Error | null = null;
  try {
    await runProcess({
      jobId,
      command: 'codex',
      args,
      cwd,
      env: buildRuntimeEnv('codex'),
      stdin: prompt,
      timeoutMs,
      onLine: (line, stream) => {
        if (stream === 'stdout') {
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            const message = formatCodexEventBody(event);
            if (message) onLog(`${message}\n`);
            // Valid JSON with no known fields: silently drop (matches original behavior)
          } catch {
            // Invalid JSON: log raw line (matches original behavior)
            onLog(`${line}\n`);
          }
        } else {
          onLog(`${line}\n`);
        }
      },
      onLog,
    });
  } catch (err) {
    caught = err as Error;
  }

  let output = '';
  try {
    output = readFileSync(outputPath, 'utf8').trim();
  } catch {
    output = '';
  }
  try { unlinkSync(outputPath); } catch { /* ignore */ }

  if (caught) throw caught;
  if (!output) throw new Error('codex produced no output');
  return output;
}

export const codexDriver: RuntimeDriver = {
  id: 'codex',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const outputPath = allocateOutputPath(opts.jobId, 'step');
    const args = buildArgs(opts.step, opts.task, opts.cwd, outputPath);
    return runCodex(opts.jobId, args, outputPath, opts.cwd, opts.prompt, opts.onLog);
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const outputPath = allocateOutputPath(opts.jobId, 'summary');
    const args = buildArgs(opts.step, { effort: null }, opts.cwd, outputPath);
    return runCodex(opts.jobId, args, outputPath, opts.cwd, opts.prompt, () => {}, 60_000);
  },
};
