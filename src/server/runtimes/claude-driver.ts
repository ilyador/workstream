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
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type !== 'assistant') return null;
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
    if (!message?.content) return null;
    const parts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        const input = block.input as Record<string, unknown> | undefined;
        const hint = input?.file_path ?? input?.path ?? input?.command ?? input?.pattern ?? '';
        parts.push(`[${block.name}] ${hint}`.trim());
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null;
  }
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
