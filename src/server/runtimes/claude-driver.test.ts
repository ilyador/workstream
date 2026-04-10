import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

class MockProc extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill = vi.fn(() => true);
}

function baseStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'step-1',
    name: 'Code',
    runtime_kind: 'coding',
    runtime_id: 'claude_code',
    runtime_variant: 'sonnet',
    tools: ['Read', 'Edit', 'Write', 'Bash'],
    context_sources: [],
    pipeline: null,
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('ClaudeDriver', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns claude with --allowedTools from step.tools', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'Build it',
      onLog: () => {},
    });

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe('claude');
    expect(args).toContain('--allowedTools');
    const idx = args.indexOf('--allowedTools');
    expect(args[idx + 1]).toBe('Read,Edit,Write,Bash');

    proc.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}\n'));
    proc.emit('close', 0);
    await promise;
  });

  it('adds --disallowedTools for write tools not in the allowed set', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: ['Read'] }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'Analyze',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    const idx = args.indexOf('--disallowedTools');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1].split(',').sort()).toEqual(['Edit', 'NotebookEdit', 'Write']);

    proc.emit('close', 0);
    await promise;
  });

  it('passes runtime_variant as --model', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep({ runtime_variant: 'opus' }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    const idx = args.indexOf('--model');
    expect(args[idx + 1]).toBe('opus');
    proc.emit('close', 0);
    await promise;
  });

  it('passes task.effort as --effort when provided', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: 'high' },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--effort');
    expect(args[args.indexOf('--effort') + 1]).toBe('high');
    proc.emit('close', 0);
    await promise;
  });

  it('writes the prompt to stdin', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'hello claude',
      onLog: () => {},
    });

    expect(proc.stdin.write).toHaveBeenCalledWith('hello claude');
    expect(proc.stdin.end).toHaveBeenCalled();
    proc.emit('close', 0);
    await promise;
  });

  it('treats exit code 1 as success when output contains [done] Phase complete', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const logs: string[] = [];
    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: (t) => logs.push(t),
    });

    proc.stdout.emit('data', Buffer.from('{"type":"assistant","message":{"content":[{"type":"text","text":"[done] Phase complete"}]}}\n'));
    proc.emit('close', 1);
    await expect(promise).resolves.toBe('[done] Phase complete');
  });

  it('rejects on non-zero exit without the done marker', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });

    proc.emit('close', 2);
    await expect(promise).rejects.toThrow(/exited with code 2/);
  });

  describe('summarize', () => {
    it('spawns claude in summary mode with --max-turns 1', async () => {
      const proc = new MockProc();
      spawnMock.mockReturnValue(proc);

      const { claudeDriver } = await import('./claude-driver.js');
      const promise = claudeDriver.summarize({
        jobId: 'j1',
        step: baseStep({ runtime_variant: 'sonnet' }),
        cwd: '/work',
        prompt: 'summarize',
      });

      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args).toEqual(['-p', '--output-format', 'text', '--max-turns', '1', '--model', 'sonnet']);
      proc.stdout.emit('data', Buffer.from('a summary\n'));
      proc.emit('close', 0);
      await expect(promise).resolves.toBe('a summary');
    });

    it('falls back to sonnet when runtime_variant is null', async () => {
      const proc = new MockProc();
      spawnMock.mockReturnValue(proc);

      const { claudeDriver } = await import('./claude-driver.js');
      const promise = claudeDriver.summarize({
        jobId: 'j1',
        step: baseStep({ runtime_variant: null }),
        cwd: '/work',
        prompt: 'summarize',
      });

      const args = spawnMock.mock.calls[0][1] as string[];
      expect(args[args.indexOf('--model') + 1]).toBe('sonnet');
      proc.emit('close', 0);
      await promise;
    });
  });
});
