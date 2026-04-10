import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileSyncMock = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: execFileSyncMock,
}));

describe('ai runtime discovery', () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
    vi.resetModules();
  });

  it('detects installed runtimes from the supported command list', async () => {
    execFileSyncMock.mockImplementation((_cmd: string, args: string[]) => {
      const runtimeCommand = args[0];
      if (runtimeCommand === 'claude') return '/usr/bin/claude\n';
      if (runtimeCommand === 'codex') return '/usr/bin/codex\n';
      throw new Error('not found');
    });

    const { refreshDetectedAiRuntimes } = await import('./ai-runtime-discovery.js');
    const runtimes = refreshDetectedAiRuntimes();

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
  });
});
