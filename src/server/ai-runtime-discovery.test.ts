import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.fn();

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('util', async () => {
  const actual = await vi.importActual<typeof import('util')>('util');
  return {
    ...actual,
    promisify: (fn: unknown) => {
      if (fn === execFileMock) {
        return (cmd: string, args: string[]) => new Promise((resolve, reject) => {
          try {
            const stdout = execFileMock(cmd, args);
            if (stdout instanceof Error) reject(stdout);
            else resolve({ stdout, stderr: '' });
          } catch (err) {
            reject(err);
          }
        });
      }
      return actual.promisify(fn as (...a: unknown[]) => unknown);
    },
  };
});

describe('ai runtime discovery', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    vi.resetModules();
  });

  it('detects installed runtimes from the supported command list', async () => {
    execFileMock.mockImplementation((_cmd: string, args: string[]) => {
      const runtimeCommand = args[0];
      if (runtimeCommand === 'claude') return '/usr/bin/claude\n';
      if (runtimeCommand === 'codex') return '/usr/bin/codex\n';
      if (runtimeCommand === 'ollama') return '/usr/bin/ollama\n';
      throw new Error('not found');
    });

    const { refreshDetectedAiRuntimes } = await import('./ai-runtime-discovery.js');
    const runtimes = await refreshDetectedAiRuntimes();

    expect(runtimes.find(runtime => runtime.id === 'claude_code')).toMatchObject({
      available: true,
      detectedPath: '/usr/bin/claude',
    });
    expect(runtimes.find(runtime => runtime.id === 'codex')).toMatchObject({
      available: true,
      detectedPath: '/usr/bin/codex',
    });
    expect(runtimes.find(runtime => runtime.id === 'qwen_code')).toMatchObject({
      available: false,
      detectedPath: null,
    });
    expect(runtimes.find(runtime => runtime.id === 'gemma_code')).toMatchObject({
      available: true,
      detectedPath: '/usr/bin/ollama',
    });
  });

  it('caches results and does not re-spawn on subsequent calls', async () => {
    execFileMock.mockImplementation(() => '/usr/bin/found');
    const { refreshDetectedAiRuntimes, getDetectedAiRuntimes } = await import('./ai-runtime-discovery.js');

    await refreshDetectedAiRuntimes();
    const callCount = execFileMock.mock.calls.length;
    await getDetectedAiRuntimes();
    expect(execFileMock.mock.calls.length).toBe(callCount);
  });
});
