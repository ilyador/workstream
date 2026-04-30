import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

const QWEN_SUMMARY_TIMEOUT_MS = 180_000;
const QWEN_EXECUTE_MAX_SESSION_TURNS = 24;
const QWEN_SUMMARY_MAX_SESSION_TURNS = 1;

const QWEN_CORE_TOOLS = [
  'read_file',
  'write_file',
  'edit',
  'glob',
  'grep_search',
  'run_shell_command',
  'list_directory',
  'web_fetch',
  'web_search',
  'todo_write',
  'save_memory',
  'lsp',
  'cron_create',
  'cron_list',
  'cron_delete',
];

const QWEN_EXTRA_TOOLS = [
  'agent',
  'skill',
  'exit_plan_mode',
  'ask_user_question',
];

const QWEN_TOOL_MAP: Record<string, string[]> = {
  Read: ['read_file', 'list_directory'],
  Write: ['write_file'],
  Edit: ['edit'],
  Bash: ['run_shell_command'],
  Grep: ['grep_search'],
  Glob: ['glob'],
  WebFetch: ['web_fetch'],
  WebSearch: ['web_search'],
  TodoWrite: ['todo_write'],
  Agent: ['agent'],
  Skill: ['skill'],
};

interface QwenRunState {
  finalResult: string | null;
  finalAssistantText: string[];
  partialText: string[];
  statusLines: string[];
  loggedThinking: boolean;
  loggedTextStart: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function qwenToolNames(tools: string[]): string[] {
  return unique(tools.flatMap(tool => QWEN_TOOL_MAP[tool] ?? [tool]));
}

function buildToolArgs(step: FlowStepConfig): string[] {
  if (step.tools.length === 0) return [];

  const allowedTools = qwenToolNames(step.tools);
  const allowedSet = new Set(allowedTools);
  const allowedCoreTools = allowedTools.filter(tool => QWEN_CORE_TOOLS.includes(tool));
  const excludedTools = unique([...QWEN_CORE_TOOLS, ...QWEN_EXTRA_TOOLS])
    .filter(tool => !allowedSet.has(tool));

  const args: string[] = [];
  if (allowedCoreTools.length > 0) {
    args.push('--core-tools', allowedCoreTools.join(','));
  }
  if (allowedTools.length > 0) {
    args.push('--allowed-tools', allowedTools.join(','));
  }
  if (excludedTools.length > 0) {
    args.push('--exclude-tools', excludedTools.join(','));
  }
  return args;
}

function buildArgs(step: FlowStepConfig, includePartialMessages: boolean, maxSessionTurns: number): string[] {
  const args = [
    '--output-format', 'stream-json',
    '--approval-mode', 'yolo',
    '--max-session-turns', String(maxSessionTurns),
    ...buildToolArgs(step),
  ];
  if (includePartialMessages) args.push('--include-partial-messages');
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  return args;
}

function buildEnv(): NodeJS.ProcessEnv {
  return {
    ...buildRuntimeEnv('qwen_code'),
    QWEN_CODE_NO_RELAUNCH: 'true',
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function firstNonEmpty(values: string[]): string {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function formatDuration(durationMs: unknown): string {
  return typeof durationMs === 'number' ? ` (${(durationMs / 1000).toFixed(1)}s)` : '';
}

function formatToolUse(block: Record<string, unknown>): string | null {
  const toolName = stringValue(block.name) ?? 'tool';
  const input = objectValue(block.input) ?? {};
  const hint = stringValue(input.file_path)
    ?? stringValue(input.path)
    ?? stringValue(input.pattern)
    ?? stringValue(input.command)
    ?? '';
  return hint ? `[${toolName}] ${hint.substring(0, 120)}` : `[${toolName}]`;
}

function handleAssistantEvent(event: Record<string, unknown>, state: QwenRunState, onLog: (text: string) => void): void {
  const message = objectValue(event.message);
  const content = Array.isArray(message?.content) ? message.content : [];
  const parts: string[] = [];

  for (const blockValue of content) {
    const block = objectValue(blockValue);
    if (!block) continue;
    if (block.type === 'text') {
      const text = stringValue(block.text);
      if (text) {
        parts.push(text);
      }
    } else if (block.type === 'tool_use') {
      const formatted = formatToolUse(block);
      if (formatted) parts.push(formatted);
    }
  }

  if (parts.length === 0) return;
  state.finalAssistantText.push(...parts);
  onLog(`${parts.join('\n')}\n`);
}

function handleStreamEvent(event: Record<string, unknown>, state: QwenRunState, onLog: (text: string) => void): void {
  const streamEvent = objectValue(event.event);
  if (!streamEvent) return;

  if (streamEvent.type === 'content_block_start') {
    const block = objectValue(streamEvent.content_block);
    if (block?.type === 'tool_use') {
      const formatted = formatToolUse(block);
      if (formatted) {
        state.statusLines.push(formatted);
        onLog(`${formatted}\n`);
      }
    } else if (block?.type === 'thinking' && !state.loggedThinking) {
      state.loggedThinking = true;
      onLog('[qwen] reasoning...\n');
    }
    return;
  }

  if (streamEvent.type === 'content_block_delta') {
    const delta = objectValue(streamEvent.delta);
    if (delta?.type === 'text_delta') {
      const text = stringValue(delta.text);
      if (text) {
        state.partialText.push(text);
        if (!state.loggedTextStart) {
          state.loggedTextStart = true;
          onLog('[qwen] responding...\n');
        }
      }
    } else if (delta?.type === 'thinking_delta' && !state.loggedThinking) {
      state.loggedThinking = true;
      onLog('[qwen] reasoning...\n');
    } else if (delta?.type === 'input_json_delta') {
      const partialJson = stringValue(delta.partial_json);
      if (partialJson) {
        const status = `[qwen] tool input ${partialJson.substring(0, 120)}`;
        state.statusLines.push(status);
        onLog(`${status}\n`);
      }
    }
    return;
  }

  if (streamEvent.type === 'tool_progress') {
    onLog('[qwen] tool progress\n');
  }
}

function handleQwenLine(line: string, state: QwenRunState, onLog: (text: string) => void): void {
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(line) as Record<string, unknown>;
  } catch {
    if (line.trim()) {
      state.statusLines.push(line);
      onLog(`${line}\n`);
    }
    return;
  }

  if (event.type === 'system' && event.subtype === 'init') {
    const model = stringValue(event.model);
    const status = model ? `[qwen] started ${model}` : '[qwen] started';
    state.statusLines.push(status);
    onLog(`${status}\n`);
    return;
  }

  if (event.type === 'stream_event') {
    handleStreamEvent(event, state, onLog);
    return;
  }

  if (event.type === 'assistant') {
    handleAssistantEvent(event, state, onLog);
    return;
  }

  if (event.type === 'result') {
    const result = stringValue(event.result);
    if (result?.trim()) state.finalResult = result;
    const status = `[done] Phase complete${formatDuration(event.duration_ms)}`;
    state.statusLines.push(status);
    onLog(`${status}\n`);
    return;
  }

  if (event.type === 'error') {
    const message = stringValue(event.message) ?? stringValue(event.error);
    if (message) onLog(`[qwen] ${message}\n`);
  }
}

async function runQwen(
  opts: {
    jobId: string;
    step: FlowStepConfig;
    cwd: string;
    prompt: string;
    onLog: (text: string) => void;
    timeoutMs?: number;
    includePartialMessages: boolean;
    maxSessionTurns: number;
  },
): Promise<string> {
  const state: QwenRunState = {
    finalResult: null,
    finalAssistantText: [],
    partialText: [],
    statusLines: [],
    loggedThinking: false,
    loggedTextStart: false,
  };

  await runProcess({
    jobId: opts.jobId,
    command: 'qwen',
    args: buildArgs(opts.step, opts.includePartialMessages, opts.maxSessionTurns),
    cwd: opts.cwd,
    env: buildEnv(),
    stdin: opts.prompt,
    timeoutMs: opts.timeoutMs,
    onLine: (line, stream) => {
      if (stream === 'stdout') {
        handleQwenLine(line, state, opts.onLog);
      } else if (line.trim()) {
        opts.onLog(`${line}\n`);
      }
    },
    onLog: opts.onLog,
  });

  const output = firstNonEmpty([
    state.finalResult ?? '',
    state.finalAssistantText.join('\n'),
    state.partialText.join(''),
  ]);
  if (output) return output;

  const toolOnlyOutput = state.statusLines
    .filter(line => !line.startsWith('[qwen] started') && !line.startsWith('[done]'))
    .join('\n')
    .trim();
  if (toolOnlyOutput) return toolOnlyOutput;

  throw new Error('qwen produced no output');
}

export const qwenDriver: RuntimeDriver = {
  id: 'qwen_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    return runQwen({
      jobId: opts.jobId,
      step: opts.step,
      cwd: opts.cwd,
      prompt: opts.prompt,
      timeoutMs: opts.timeoutMs,
      onLog: opts.onLog,
      includePartialMessages: true,
      maxSessionTurns: QWEN_EXECUTE_MAX_SESSION_TURNS,
    });
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    return runQwen({
      jobId: opts.jobId,
      step: opts.step,
      cwd: opts.cwd,
      prompt: opts.prompt,
      timeoutMs: QWEN_SUMMARY_TIMEOUT_MS,
      onLog: () => {},
      includePartialMessages: false,
      maxSessionTurns: QWEN_SUMMARY_MAX_SESSION_TURNS,
    });
  },
};
