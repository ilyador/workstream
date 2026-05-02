import { execFile } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { promisify } from 'util';
import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';

const execFileAsync = promisify(execFile);

const GEMMA_SUMMARY_TIMEOUT_MS = 180_000;
const DEFAULT_GEMMA_MODEL = 'gemma4:e4b';
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const GEMMA_MAX_TOOL_ROUNDS = 24;
const GEMMA_MAX_TOOL_OUTPUT_CHARS = 12_000;
const GEMMA_REQUEST_TIMEOUT_MS = 15 * 60_000;
const GEMMA_MAX_TOOL_CALLS_PER_TARGET = 10;

const GEMMA_MODEL_INFO: Record<string, { context: number; output: number }> = {
  'gemma4:e2b': { context: 128_000, output: 8_192 },
  'gemma4:e4b': { context: 128_000, output: 8_192 },
  'gemma4:26b': { context: 256_000, output: 16_384 },
  'gemma4:31b': { context: 256_000, output: 16_384 },
};

const GEMMA_TOOL_MAP: Record<string, string[]> = {
  Read: ['read_file', 'list_directory'],
  Write: ['write_file'],
  Edit: ['edit'],
  Bash: ['run_shell_command'],
  Grep: ['grep_search'],
  Glob: ['glob'],
};

type GemmaRole = 'system' | 'user' | 'assistant' | 'tool';

interface GemmaMessage {
  role: GemmaRole;
  content?: string;
  thinking?: string;
  tool_call_id?: string;
  tool_calls?: GemmaToolCall[];
}

interface GemmaToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

interface GemmaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message?: GemmaMessage;
  error?: string;
}

interface GemmaRunOptions {
  jobId: string;
  step: FlowStepConfig;
  cwd: string;
  prompt: string;
  onLog: (text: string) => void;
  timeoutMs?: number;
  allowTools: boolean;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function gemmaToolNames(tools: string[]): string[] {
  return unique(tools.flatMap(tool => GEMMA_TOOL_MAP[tool] ?? []));
}

function normalizeOllamaBaseUrl(raw: string | undefined): string {
  const value = raw?.trim() || DEFAULT_OLLAMA_BASE_URL;
  return value
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '')
    .replace(/\/api$/, '');
}

function ollamaBaseUrl(env: NodeJS.ProcessEnv): string {
  return normalizeOllamaBaseUrl(
    env.GEMMA_OLLAMA_BASE_URL
      ?? env.OLLAMA_BASE_URL
      ?? env.OLLAMA_HOST
      ?? env.GEMMA_OPENAI_BASE_URL
      ?? env.OPENAI_BASE_URL,
  );
}

function modelContext(modelId: string): number {
  return GEMMA_MODEL_INFO[modelId]?.context ?? 128_000;
}

function modelOutput(modelId: string): number {
  return GEMMA_MODEL_INFO[modelId]?.output ?? 8_192;
}

function stringArg(args: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string') return value;
  }
  return null;
}

function booleanArg(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

function numberArg(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function truncate(text: string, maxChars = GEMMA_MAX_TOOL_OUTPUT_CHARS): string {
  return text.length > maxChars ? `${text.substring(0, maxChars)}\n...[truncated]` : text;
}

function resolveInside(cwd: string, requestedPath: string): string {
  const target = resolve(cwd, requestedPath || '.');
  const rel = relative(cwd, target);
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/') && rel !== '..')) return target;
  throw new Error(`Path is outside the repository root: ${requestedPath}`);
}

function toolParameters(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function allGemmaTools(): Record<string, GemmaTool> {
  return {
    read_file: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a UTF-8 text file inside the repository.',
        parameters: toolParameters({
          path: { type: 'string', description: 'Relative path to the file.' },
          start_line: { type: 'number', description: 'Optional 1-based starting line.' },
          limit: { type: 'number', description: 'Optional maximum number of lines.' },
        }, ['path']),
      },
    },
    list_directory: {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List files and directories inside a repository directory.',
        parameters: toolParameters({
          path: { type: 'string', description: 'Relative directory path. Use "." for the repository root.' },
        }, ['path']),
      },
    },
    write_file: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write a UTF-8 text file inside the repository, creating parent directories if needed.',
        parameters: toolParameters({
          path: { type: 'string', description: 'Relative path to write.' },
          content: { type: 'string', description: 'Full file contents.' },
        }, ['path', 'content']),
      },
    },
    edit: {
      type: 'function',
      function: {
        name: 'edit',
        description: 'Replace text in a UTF-8 file inside the repository.',
        parameters: toolParameters({
          path: { type: 'string', description: 'Relative file path.' },
          old_string: { type: 'string', description: 'Exact text to replace.' },
          new_string: { type: 'string', description: 'Replacement text.' },
          replace_all: { type: 'boolean', description: 'When true, replace every occurrence.' },
        }, ['path', 'old_string', 'new_string']),
      },
    },
    grep_search: {
      type: 'function',
      function: {
        name: 'grep_search',
        description: 'Search repository files with ripgrep.',
        parameters: toolParameters({
          pattern: { type: 'string', description: 'Ripgrep pattern.' },
          path: { type: 'string', description: 'Optional relative file or directory path.' },
        }, ['pattern']),
      },
    },
    glob: {
      type: 'function',
      function: {
        name: 'glob',
        description: 'List repository files matching a glob pattern.',
        parameters: toolParameters({
          pattern: { type: 'string', description: 'Glob pattern such as "src/**/*.ts".' },
        }, ['pattern']),
      },
    },
    run_shell_command: {
      type: 'function',
      function: {
        name: 'run_shell_command',
        description: 'Run a shell command in the repository root.',
        parameters: toolParameters({
          command: { type: 'string', description: 'Command to run.' },
        }, ['command']),
      },
    },
  };
}

function toolsForStep(step: FlowStepConfig, allowTools: boolean): GemmaTool[] {
  if (!allowTools || step.tools.length === 0) return [];
  const available = allGemmaTools();
  return gemmaToolNames(step.tools)
    .map(name => available[name])
    .filter((tool): tool is GemmaTool => Boolean(tool));
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function readFileTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const requestedPath = stringArg(args, 'path', 'file_path', 'filePath');
  if (!requestedPath) throw new Error('Missing required argument: path');
  const target = resolveInside(cwd, requestedPath);
  const content = readFileSync(target, 'utf-8');
  const lines = content.split('\n');
  const startLine = Math.max(1, Math.floor(numberArg(args, 'start_line') ?? numberArg(args, 'startLine') ?? 1));
  const limit = Math.max(1, Math.floor(numberArg(args, 'limit') ?? lines.length));
  return truncate(lines.slice(startLine - 1, startLine - 1 + limit).join('\n'));
}

async function listDirectoryTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const requestedPath = stringArg(args, 'path', 'directory') ?? '.';
  const target = resolveInside(cwd, requestedPath);
  const entries = readdirSync(target)
    .map(name => {
      const fullPath = resolve(target, name);
      return statSync(fullPath).isDirectory() ? `${name}/` : name;
    })
    .sort();
  return entries.join('\n') || '(empty)';
}

async function writeFileTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const requestedPath = stringArg(args, 'path', 'file_path', 'filePath');
  const content = stringArg(args, 'content');
  if (!requestedPath) throw new Error('Missing required argument: path');
  if (content === null) throw new Error('Missing required argument: content');
  const target = resolveInside(cwd, requestedPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return `wrote ${requestedPath} (${content.length} bytes)`;
}

async function editTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const requestedPath = stringArg(args, 'path', 'file_path', 'filePath');
  const oldString = stringArg(args, 'old_string', 'oldString');
  const newString = stringArg(args, 'new_string', 'newString');
  if (!requestedPath) throw new Error('Missing required argument: path');
  if (oldString === null) throw new Error('Missing required argument: old_string');
  if (newString === null) throw new Error('Missing required argument: new_string');

  const target = resolveInside(cwd, requestedPath);
  const original = readFileSync(target, 'utf-8');
  if (!original.includes(oldString)) {
    throw new Error(`old_string was not found in ${requestedPath}`);
  }
  const updated = booleanArg(args, 'replace_all')
    ? original.split(oldString).join(newString)
    : original.replace(oldString, newString);
  writeFileSync(target, updated);
  return `edited ${requestedPath}`;
}

async function grepSearchTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const pattern = stringArg(args, 'pattern');
  if (!pattern) throw new Error('Missing required argument: pattern');
  const requestedPath = stringArg(args, 'path') ?? '.';
  const target = resolveInside(cwd, requestedPath);
  try {
    const { stdout } = await execFileAsync('rg', ['--line-number', '--no-heading', pattern, target], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return truncate(stdout.trim() || '(no matches)');
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 1) return '(no matches)';
    return truncate([err.stdout, err.stderr].filter(Boolean).join('\n') || String(error));
  }
}

async function globTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const pattern = stringArg(args, 'pattern');
  if (!pattern) throw new Error('Missing required argument: pattern');
  try {
    const { stdout } = await execFileAsync('rg', ['--files', '-g', pattern], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
    return truncate(stdout.trim() || '(no matches)');
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    if (err.code === 1) return '(no matches)';
    return truncate([err.stdout, err.stderr].filter(Boolean).join('\n') || String(error));
  }
}

async function runShellCommandTool(cwd: string, args: Record<string, unknown>): Promise<string> {
  const command = stringArg(args, 'command');
  if (!command) throw new Error('Missing required argument: command');
  const shell = process.env.SHELL || '/bin/sh';
  try {
    const { stdout, stderr } = await execFileAsync(shell, ['-lc', command], {
      cwd,
      encoding: 'utf-8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
    return truncate([stdout.trim(), stderr.trim()].filter(Boolean).join('\n') || '(no output)');
  } catch (error) {
    const err = error as { code?: number; stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout?.trim(), err.stderr?.trim(), err.message].filter(Boolean).join('\n');
    return truncate(`exit ${err.code ?? 'unknown'}\n${output}`);
  }
}

async function runTool(name: string, cwd: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'read_file': return readFileTool(cwd, args);
    case 'list_directory': return listDirectoryTool(cwd, args);
    case 'write_file': return writeFileTool(cwd, args);
    case 'edit': return editTool(cwd, args);
    case 'grep_search': return grepSearchTool(cwd, args);
    case 'glob': return globTool(cwd, args);
    case 'run_shell_command': return runShellCommandTool(cwd, args);
    default: throw new Error(`Unknown Gemma tool: ${name}`);
  }
}

function toolTitle(name: string, args: Record<string, unknown>): string {
  const path = stringArg(args, 'path', 'file_path', 'filePath', 'directory');
  const command = stringArg(args, 'command');
  const pattern = stringArg(args, 'pattern');
  return [name, path ?? command ?? pattern].filter(Boolean).join(' ');
}

function toolRepeatKey(name: string, args: Record<string, unknown>): string {
  const path = stringArg(args, 'path', 'file_path', 'filePath', 'directory');
  if (path) return `file:${path}`;
  const command = stringArg(args, 'command');
  if (command) return `command:${command}`;
  const pattern = stringArg(args, 'pattern');
  if (pattern) return `${name}:${pattern}`;
  return `${name}:unknown-target`;
}

function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes >= 1 ? `${minutes}m` : `${Math.round(ms / 1000)}s`;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'AbortError');
}

function buildSystemPrompt(cwd: string): string {
  return `You are Gemma running as a non-interactive coding agent.
Use tool calls to inspect and edit files. Do not just describe repository changes.
The repository root is ${cwd}. Use only relative paths inside that root.
Available file tools use snake_case argument names:
- read_file({ "path": "relative/file" })
- list_directory({ "path": "." })
- write_file({ "path": "relative/file", "content": "full contents" })
- edit({ "path": "relative/file", "old_string": "exact text", "new_string": "replacement" })
- grep_search({ "pattern": "text or regex", "path": "." })
- glob({ "pattern": "src/**/*.ts" })
- run_shell_command({ "command": "command to run" })
After tool calls are complete, respond with a concise result and include the required [summary] line if the user prompt requests one.`;
}

async function chat(
  baseUrl: string,
  modelId: string,
  messages: GemmaMessage[],
  tools: GemmaTool[],
  timeoutMs: number,
): Promise<OllamaChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelId,
        stream: false,
        messages,
        tools,
        options: {
          temperature: 0.1,
          num_ctx: modelContext(modelId),
          num_predict: modelOutput(modelId),
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Ollama returned HTTP ${response.status}`);
    return JSON.parse(text) as OllamaChatResponse;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`gemma request timed out after ${formatDuration(timeoutMs)} waiting for Ollama`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function runGemma(opts: GemmaRunOptions): Promise<string> {
  const env = buildRuntimeEnv('gemma_code');
  const modelId = opts.step.runtime_variant || env.GEMMA_MODEL || DEFAULT_GEMMA_MODEL;
  const baseUrl = ollamaBaseUrl(env);
  const tools = toolsForStep(opts.step, opts.allowTools);
  const deadline = Date.now() + (opts.timeoutMs ?? GEMMA_SUMMARY_TIMEOUT_MS);
  const messages: GemmaMessage[] = [
    { role: 'system', content: buildSystemPrompt(opts.cwd) },
    { role: 'user', content: opts.prompt },
  ];
  const toolTargetCounts = new Map<string, number>();

  opts.onLog(`[gemma] model=${modelId} endpoint=${baseUrl}/api/chat\n`);

  for (let round = 0; round < GEMMA_MAX_TOOL_ROUNDS; round++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new Error(`gemma timed out after ${(opts.timeoutMs ?? GEMMA_SUMMARY_TIMEOUT_MS) / 60000}m`);

    const result = await chat(baseUrl, modelId, messages, tools, Math.min(remainingMs, GEMMA_REQUEST_TIMEOUT_MS));
    if (result.error) throw new Error(result.error);
    const message = result.message;
    if (!message) throw new Error('gemma produced no message');

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const content = (message.content ?? '').trim();
      if (content) {
        opts.onLog('[gemma] responding...\n');
        return content;
      }
      throw new Error('gemma produced no output');
    }

    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      thinking: message.thinking,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name;
      const args = parseToolArguments(call.function?.arguments);
      const callId = call.id || `call_${round}_${messages.length}`;
      if (!name) {
        messages.push({ role: 'tool', tool_call_id: callId, content: 'error: missing tool name' });
        continue;
      }

      const repeatKey = toolRepeatKey(name, args);
      const repeatCount = (toolTargetCounts.get(repeatKey) ?? 0) + 1;
      toolTargetCounts.set(repeatKey, repeatCount);
      if (repeatCount > GEMMA_MAX_TOOL_CALLS_PER_TARGET) {
        throw new Error(`gemma appears stuck repeatedly using tools on ${repeatKey}; stopped after ${GEMMA_MAX_TOOL_CALLS_PER_TARGET} calls`);
      }

      opts.onLog(`[gemma:${toolTitle(name, args)}]\n`);
      let content: string;
      try {
        content = await runTool(name, opts.cwd, args);
      } catch (error) {
        content = `error: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({ role: 'tool', tool_call_id: callId, content });
    }
  }

  throw new Error(`gemma exceeded ${GEMMA_MAX_TOOL_ROUNDS} tool rounds`);
}

export const gemmaDriver: RuntimeDriver = {
  id: 'gemma_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    if (!existsSync(opts.cwd)) throw new Error(`Working directory does not exist: ${opts.cwd}`);
    return runGemma({
      jobId: opts.jobId,
      step: opts.step,
      cwd: opts.cwd,
      prompt: opts.prompt,
      onLog: opts.onLog,
      timeoutMs: opts.timeoutMs,
      allowTools: true,
    });
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    return runGemma({
      jobId: opts.jobId,
      step: opts.step,
      cwd: opts.cwd,
      prompt: opts.prompt,
      onLog: () => {},
      timeoutMs: GEMMA_SUMMARY_TIMEOUT_MS,
      allowTools: false,
    });
  },
};
