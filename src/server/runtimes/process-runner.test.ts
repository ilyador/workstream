import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('../process-lifecycle.js', async () => {
  const actual = await vi.importActual<typeof import('../process-lifecycle.js')>('../process-lifecycle.js');
  return actual;
});

class MockProc extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill = vi.fn((signal?: string) => {
    this.killed = true;
    setTimeout(() => this.emit('close', signal === 'SIGKILL' ? 137 : 143), 0);
    return true;
  });
}

function makeProc(): MockProc {
  return new MockProc();
}

describe('runProcess', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    vi.useRealTimers();
  });

  it('spawns the command with the provided args, cwd, and env', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: ['--foo', 'bar'],
      cwd: '/work',
      env: { PATH: '/bin' },
      onLine: () => {},
      onLog: () => {},
    });

    expect(spawnMock).toHaveBeenCalledWith('claude', ['--foo', 'bar'], expect.objectContaining({
      cwd: '/work',
      env: { PATH: '/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    }));

    proc.emit('close', 0);
    const result = await promise;
    expect(result.exitCode).toBe(0);
  });

  it('writes stdin when provided and calls end()', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      stdin: 'hello prompt',
      onLine: () => {},
      onLog: () => {},
    });

    expect(proc.stdin.write).toHaveBeenCalledWith('hello prompt');
    expect(proc.stdin.end).toHaveBeenCalled();
    proc.emit('close', 0);
    await promise;
  });

  it('splits stdout on newlines and calls onLine per line', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const lines: Array<{ line: string; stream: string }> = [];
    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: (line, stream) => lines.push({ line, stream }),
      onLog: () => {},
    });

    proc.stdout.emit('data', Buffer.from('line1\nline2\npart'));
    proc.stdout.emit('data', Buffer.from('ial\n'));
    proc.emit('close', 0);
    await promise;

    expect(lines).toEqual([
      { line: 'line1', stream: 'stdout' },
      { line: 'line2', stream: 'stdout' },
      { line: 'partial', stream: 'stdout' },
    ]);
  });

  it('forwards stderr lines to onLine with stream=stderr', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const lines: Array<{ line: string; stream: string }> = [];
    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: (line, stream) => lines.push({ line, stream }),
      onLog: () => {},
    });

    proc.stderr.emit('data', Buffer.from('error text\n'));
    proc.emit('close', 1);
    await expect(promise).rejects.toThrow();
    expect(lines).toEqual([{ line: 'error text', stream: 'stderr' }]);
  });

  it('resolves with accumulated stdout and stderr on close', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: () => {},
      onLog: () => {},
    });

    proc.stdout.emit('data', Buffer.from('hello\n'));
    proc.stderr.emit('data', Buffer.from('warn\n'));
    proc.emit('close', 0);

    const result = await promise;
    expect(result.stdout).toBe('hello\n');
    expect(result.stderr).toBe('warn\n');
    expect(result.exitCode).toBe(0);
  });

  it('rejects with the exit code when process exits non-zero', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: () => {},
      onLog: () => {},
    });

    proc.stderr.emit('data', Buffer.from('boom\n'));
    proc.emit('close', 42);

    await expect(promise).rejects.toThrow(/exited with code 42/);
  });

  it('rejects with "Job canceled" when the job is marked canceled', async () => {
    const { markJobCanceled, clearJobCancellation } = await import('../process-lifecycle.js');
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-cancel',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: () => {},
      onLog: () => {},
    });

    markJobCanceled('job-cancel');
    proc.emit('close', 137);
    await expect(promise).rejects.toThrow(/Job canceled/);
    clearJobCancellation('job-cancel');
  });

  it('kills the process with SIGTERM after the timeout', async () => {
    vi.useFakeTimers();
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      timeoutMs: 1000,
      onLine: () => {},
      onLog: () => {},
    });
    // Attach rejection handler before advancing timers to avoid unhandled rejection window.
    const settled = promise.catch((err) => err);

    await vi.advanceTimersByTimeAsync(1100);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    await settled;
    vi.useRealTimers();
  });

  it('applies the 30-minute default timeout when none is specified', async () => {
    vi.useFakeTimers();
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const { runProcess, DEFAULT_PROCESS_TIMEOUT_MS } = await import('./process-runner.js');
    expect(DEFAULT_PROCESS_TIMEOUT_MS).toBe(30 * 60 * 1000);

    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      onLine: () => {},
      onLog: () => {},
    });
    // Attach rejection handler before advancing timers to avoid unhandled rejection window.
    const settled = promise.catch((err) => err);

    await vi.advanceTimersByTimeAsync(DEFAULT_PROCESS_TIMEOUT_MS + 100);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    await settled;
    vi.useRealTimers();
  });

  it('logs stdin write errors without silently swallowing them', async () => {
    const proc = makeProc();
    spawnMock.mockReturnValue(proc);

    const logs: string[] = [];
    const { runProcess } = await import('./process-runner.js');
    const promise = runProcess({
      jobId: 'job-1',
      command: 'claude',
      args: [],
      cwd: '/work',
      env: {},
      stdin: 'hi',
      onLine: () => {},
      onLog: (text) => logs.push(text),
    });

    proc.stdin.emit('error', new Error('EPIPE'));
    proc.emit('close', 0);
    await promise;
    expect(logs.some(log => log.includes('EPIPE'))).toBe(true);
  });
});
