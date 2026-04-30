import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRuntimeEnv } from './env.js';

describe('buildRuntimeEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      HOME: '/home/test',
      PATH: '/usr/bin:/bin',
      USER: 'test',
      LANG: 'en_US.UTF-8',
      TMPDIR: '/tmp',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      OPENAI_API_KEY: 'sk-openai-secret',
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      OPENAI_MODEL: 'qwen-local',
      OLLAMA_API_KEY: 'ollama-secret',
      DASHSCOPE_API_KEY: 'sk-dashscope-secret',
      DATABASE_URL: 'postgres://secret',
      GITHUB_TOKEN: 'github-secret',
      SUPABASE_SERVICE_ROLE_KEY: 'supabase-secret',
      SUPABASE_URL: 'https://secret.supabase.co',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets TERM to dumb for all runtimes', () => {
    for (const id of ['claude_code', 'codex', 'qwen_code'] as const) {
      expect(buildRuntimeEnv(id).TERM).toBe('dumb');
    }
  });

  it('prepends ~/.local/bin to PATH', () => {
    expect(buildRuntimeEnv('claude_code').PATH).toBe('/home/test/.local/bin:/usr/bin:/bin');
  });

  it('forwards ANTHROPIC_API_KEY only to claude_code', () => {
    expect(buildRuntimeEnv('claude_code').ANTHROPIC_API_KEY).toBe('sk-ant-secret');
    expect(buildRuntimeEnv('codex').ANTHROPIC_API_KEY).toBeUndefined();
    expect(buildRuntimeEnv('qwen_code').ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('forwards OPENAI_API_KEY to OpenAI-compatible runtimes', () => {
    expect(buildRuntimeEnv('codex').OPENAI_API_KEY).toBe('sk-openai-secret');
    expect(buildRuntimeEnv('claude_code').OPENAI_API_KEY).toBeUndefined();
    expect(buildRuntimeEnv('qwen_code').OPENAI_API_KEY).toBe('sk-openai-secret');
  });

  it('forwards local OpenAI-compatible Qwen settings to qwen_code only', () => {
    const qwenEnv = buildRuntimeEnv('qwen_code');
    expect(qwenEnv.OPENAI_BASE_URL).toBe('http://localhost:11434/v1');
    expect(qwenEnv.OPENAI_MODEL).toBe('qwen-local');
    expect(qwenEnv.OLLAMA_API_KEY).toBe('ollama-secret');

    expect(buildRuntimeEnv('claude_code').OPENAI_BASE_URL).toBeUndefined();
    expect(buildRuntimeEnv('claude_code').OPENAI_MODEL).toBeUndefined();
    expect(buildRuntimeEnv('claude_code').OLLAMA_API_KEY).toBeUndefined();
    expect(buildRuntimeEnv('codex').OPENAI_BASE_URL).toBeUndefined();
    expect(buildRuntimeEnv('codex').OPENAI_MODEL).toBeUndefined();
    expect(buildRuntimeEnv('codex').OLLAMA_API_KEY).toBeUndefined();
  });

  it('forwards DASHSCOPE_API_KEY only to qwen_code', () => {
    expect(buildRuntimeEnv('qwen_code').DASHSCOPE_API_KEY).toBe('sk-dashscope-secret');
    expect(buildRuntimeEnv('claude_code').DASHSCOPE_API_KEY).toBeUndefined();
    expect(buildRuntimeEnv('codex').DASHSCOPE_API_KEY).toBeUndefined();
  });

  it('never forwards DATABASE_URL, GITHUB_TOKEN, or SUPABASE secrets', () => {
    for (const id of ['claude_code', 'codex', 'qwen_code'] as const) {
      const env = buildRuntimeEnv(id);
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.GITHUB_TOKEN).toBeUndefined();
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      expect(env.SUPABASE_URL).toBeUndefined();
    }
  });

  it('forwards HOME, USER, LANG, TMPDIR to all runtimes', () => {
    for (const id of ['claude_code', 'codex', 'qwen_code'] as const) {
      const env = buildRuntimeEnv(id);
      expect(env.HOME).toBe('/home/test');
      expect(env.USER).toBe('test');
      expect(env.LANG).toBe('en_US.UTF-8');
      expect(env.TMPDIR).toBe('/tmp');
    }
  });

  it('skips the ~/.local/bin prefix when HOME is not set', () => {
    delete process.env.HOME;
    expect(buildRuntimeEnv('claude_code').PATH).toBe('/usr/bin:/bin');
  });

  it('falls back to a safe default PATH when process.env.PATH is not set', () => {
    delete process.env.PATH;
    expect(buildRuntimeEnv('claude_code').PATH).toBe('/home/test/.local/bin:/usr/local/bin:/usr/bin:/bin');
  });

  it('forwards LC_ALL and SHELL when set', () => {
    process.env.LC_ALL = 'C.UTF-8';
    process.env.SHELL = '/bin/zsh';
    const env = buildRuntimeEnv('claude_code');
    expect(env.LC_ALL).toBe('C.UTF-8');
    expect(env.SHELL).toBe('/bin/zsh');
  });

  it('omits LC_ALL and SHELL when not set', () => {
    delete process.env.LC_ALL;
    delete process.env.SHELL;
    const env = buildRuntimeEnv('claude_code');
    expect(env.LC_ALL).toBeUndefined();
    expect(env.SHELL).toBeUndefined();
  });

  it('forwards runtime-specific config dirs alongside API keys', () => {
    process.env.CLAUDE_CONFIG_DIR = '/custom/claude';
    process.env.CODEX_CONFIG_DIR = '/custom/codex';
    process.env.QWEN_CONFIG_DIR = '/custom/qwen';

    const claudeEnv = buildRuntimeEnv('claude_code');
    expect(claudeEnv.CLAUDE_CONFIG_DIR).toBe('/custom/claude');
    expect(claudeEnv.CODEX_CONFIG_DIR).toBeUndefined();
    expect(claudeEnv.QWEN_CONFIG_DIR).toBeUndefined();

    const codexEnv = buildRuntimeEnv('codex');
    expect(codexEnv.CODEX_CONFIG_DIR).toBe('/custom/codex');
    expect(codexEnv.CLAUDE_CONFIG_DIR).toBeUndefined();

    const qwenEnv = buildRuntimeEnv('qwen_code');
    expect(qwenEnv.QWEN_CONFIG_DIR).toBe('/custom/qwen');
    expect(qwenEnv.CODEX_CONFIG_DIR).toBeUndefined();
  });
});
