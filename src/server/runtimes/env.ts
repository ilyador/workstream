import type { AiRuntimeId } from '../../shared/ai-runtimes.js';

const BASE_ENV_KEYS = ['HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'] as const;

const RUNTIME_SECRET_KEYS: Record<AiRuntimeId, readonly string[]> = {
  claude_code: ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR'],
  codex: ['OPENAI_API_KEY', 'CODEX_CONFIG_DIR'],
  qwen_code: ['DASHSCOPE_API_KEY', 'QWEN_CONFIG_DIR'],
};

export function buildRuntimeEnv(runtimeId: AiRuntimeId): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TERM: 'dumb' };

  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  const homePath = process.env.HOME ?? '';
  const originalPath = process.env.PATH ?? '';
  env.PATH = `${homePath}/.local/bin:${originalPath}`;

  for (const key of RUNTIME_SECRET_KEYS[runtimeId] ?? []) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  return env;
}
