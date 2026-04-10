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

  it('forwards OPENAI_API_KEY only to codex', () => {
    expect(buildRuntimeEnv('codex').OPENAI_API_KEY).toBe('sk-openai-secret');
    expect(buildRuntimeEnv('claude_code').OPENAI_API_KEY).toBeUndefined();
    expect(buildRuntimeEnv('qwen_code').OPENAI_API_KEY).toBeUndefined();
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

  it('handles missing HOME by falling back to PATH as-is (no leading colon)', () => {
    delete process.env.HOME;
    expect(buildRuntimeEnv('claude_code').PATH).toBe('/.local/bin:/usr/bin:/bin');
  });
});
