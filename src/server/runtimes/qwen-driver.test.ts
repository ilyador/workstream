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
    runtime_id: 'qwen_code',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('QwenDriver', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns qwen with --output-format text and --approval-mode yolo', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'do it',
      onLog: () => {},
    });

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe('qwen');
    expect(args).toContain('--output-format');
    expect(args[args.indexOf('--output-format') + 1]).toBe('text');
    expect(args).toContain('--approval-mode');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo');

    proc.stdout.emit('data', Buffer.from('result\n'));
    proc.emit('close', 0);
    await promise;
  });

  it('passes prompt via --prompt argument', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'implement the feature',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--prompt');
    expect(args[args.indexOf('--prompt') + 1]).toBe('implement the feature');

    proc.emit('close', 0);
    await promise;
  });

  it('does not pipe prompt via stdin', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'do it',
      onLog: () => {},
    });

    expect(proc.stdin.write).not.toHaveBeenCalled();
    proc.emit('close', 0);
    await promise;
  });

  it('passes runtime_variant as --model', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep({ runtime_variant: 'qwen3-coder' }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('qwen3-coder');
    proc.emit('close', 0);
    await promise;
  });

  it('resolves with trimmed stdout on clean exit', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    proc.stdout.emit('data', Buffer.from('\n  final answer  \n'));
    proc.emit('close', 0);
    await expect(promise).resolves.toBe('final answer');
  });

  it('rejects with stderr tail on non-zero exit', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    proc.stderr.emit('data', Buffer.from('model unavailable\n'));
    proc.emit('close', 3);
    await expect(promise).rejects.toThrow(/qwen exited with code 3/);
  });
});
