import type { AiRuntimeId } from '../../shared/ai-runtimes.js';

const BASE_ENV_KEYS = ['HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'] as const;

const RUNTIME_SECRET_KEYS: Record<AiRuntimeId, readonly string[]> = {
  claude_code: ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR'],
  codex: ['OPENAI_API_KEY', 'CODEX_CONFIG_DIR'],
  qwen_code: [
    'DASHSCOPE_API_KEY',
    'QWEN_CONFIG_DIR',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
    'QWEN_MODEL',
    'OLLAMA_API_KEY',
    'OLLAMA_HOST',
    'QWEN_CODE_MAX_OUTPUT_TOKENS',
    'QWEN_CODE_TOOL_CALL_STYLE',
    'QWEN_DEFAULT_AUTH_TYPE',
  ],
  gemma_code: [
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OLLAMA_API_KEY',
    'OLLAMA_HOST',
    'OLLAMA_BASE_URL',
    'GEMMA_OPENAI_BASE_URL',
    'GEMMA_OLLAMA_BASE_URL',
    'GEMMA_MODEL',
  ],
};

export function buildRuntimeEnv(runtimeId: AiRuntimeId): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TERM: 'dumb' };

  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  const homePath = process.env.HOME;
  const originalPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
  env.PATH = homePath ? `${homePath}/.local/bin:${originalPath}` : originalPath;

  for (const key of RUNTIME_SECRET_KEYS[runtimeId] ?? []) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  return env;
}
