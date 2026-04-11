import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
const DONE_PHASE_MARKER = '[done] Phase complete';

function buildArgs(step: FlowStepConfig, task: { effort?: string | null }): string[] {
  const args = ['-p', '--verbose', '--output-format', 'stream-json'];
  if (step.tools.length > 0) {
    args.push('--allowedTools', step.tools.join(','));
    const blocked = WRITE_TOOLS.filter(tool => !step.tools.includes(tool));
    if (blocked.length > 0) args.push('--disallowedTools', blocked.join(','));
  }
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  if (task.effort) args.push('--effort', task.effort);
  return args;
}

function formatStreamEvent(line: string): string | null {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (event.type === 'assistant') {
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
    if (!message?.content) return null;
    const parts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text) {
        parts.push(block.text);
      } else if (block.type === 'tool_use') {
        const toolName = typeof block.name === 'string' ? block.name : 'unknown';
        const input = (block.input as Record<string, unknown> | undefined) ?? {};
        if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
          const hint = input.file_path ?? input.pattern ?? input.path ?? '';
          parts.push(`[${toolName}] ${hint}`);
        } else if (toolName === 'Edit' || toolName === 'Write') {
          const hint = input.file_path ?? '';
          parts.push(`[${toolName}] ${hint}`);
        } else if (toolName === 'Bash') {
          const rawCommand = typeof input.command === 'string' ? input.command : '';
          const cmd = rawCommand.substring(0, 100);
          parts.push(`[Bash] ${cmd}`);
        } else {
          parts.push(`[${toolName}]`);
        }
      }
    }
    return parts.join('\n') || null;
  }

  if (event.type === 'result') {
    const durationMs = typeof event.duration_ms === 'number' ? event.duration_ms : null;
    const duration = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
    return `[done] Phase complete${duration}`;
  }

  return null;
}

export const claudeDriver: RuntimeDriver = {
  id: 'claude_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const args = buildArgs(opts.step, opts.task);
    const collected: string[] = [];

    try {
      const result = await runProcess({
        jobId: opts.jobId,
        command: 'claude',
        args,
        cwd: opts.cwd,
        env: buildRuntimeEnv('claude_code'),
        stdin: opts.prompt,
        onLine: (line, stream) => {
          if (stream === 'stdout') {
            const formatted = formatStreamEvent(line);
            if (formatted) {
              collected.push(formatted);
              opts.onLog(`${formatted}\n`);
            }
          } else {
            opts.onLog(`${line}\n`);
          }
        },
        onLog: opts.onLog,
      });
      return collected.join('\n') || result.stdout.trim() || 'Completed';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Job canceled' || message.includes('timed out')) {
        throw err;
      }
      const collectedText = collected.join('\n');
      if (collectedText.includes(DONE_PHASE_MARKER)) {
        return collectedText;
      }
      throw err;
    }
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const model = opts.step.runtime_variant || 'sonnet';
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'claude',
      args: ['-p', '--output-format', 'text', '--max-turns', '1', '--model', model],
      cwd: opts.cwd,
      env: buildRuntimeEnv('claude_code'),
      stdin: opts.prompt,
      timeoutMs: 30_000,
      onLine: () => {},
      onLog: () => {},
    });
    return result.stdout.trim() || 'Completed';
  },
};
