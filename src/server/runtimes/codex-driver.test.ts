import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
    runtime_id: 'codex',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

const testTmpDir = join(tmpdir(), `codex-driver-test-${Date.now()}`);

describe('CodexDriver', () => {
  beforeEach(() => {
    spawnMock.mockReset();
    if (!existsSync(testTmpDir)) mkdirSync(testTmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testTmpDir)) rmSync(testTmpDir, { recursive: true, force: true });
  });

  it('spawns codex with exec --json --cd <cwd> and bypass approvals', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const outputPath = join(testTmpDir, 'out.txt');
    writeFileSync(outputPath, 'codex wrote this');

    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'do it',
      onLog: () => {},
    });

    const [cmd, args] = spawnMock.mock.calls[0];
    expect(cmd).toBe('codex');
    expect(args).toContain('exec');
    expect(args).toContain('--json');
    expect(args).toContain('--cd');
    expect(args[args.indexOf('--cd') + 1]).toBe('/work');
    expect(args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args).toContain('--output-last-message');

    // find the output path codex was told to use
    const actualOutputPath = args[args.indexOf('--output-last-message') + 1];
    writeFileSync(actualOutputPath, 'codex wrote this');

    proc.emit('close', 0);
    const result = await promise;
    expect(result).toBe('codex wrote this');
  });

  it('pipes the prompt via stdin', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'the prompt',
      onLog: () => {},
    });

    expect(proc.stdin.write).toHaveBeenCalledWith('the prompt');
    expect(proc.stdin.end).toHaveBeenCalled();

    const args = spawnMock.mock.calls[0][1] as string[];
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'ok');
    proc.emit('close', 0);
    await promise;
  });

  it('passes runtime_variant as --model before the stdin marker', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep({ runtime_variant: 'gpt-5' }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('gpt-5');
    expect(args[args.length - 1]).toBe('-');
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'ok');
    proc.emit('close', 0);
    await promise;
  });

  it('maps effort=max to model_reasoning_effort=xhigh', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: 'max' },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    const cIdx = args.indexOf('-c');
    expect(cIdx).toBeGreaterThanOrEqual(0);
    expect(args[cIdx + 1]).toBe('model_reasoning_effort="xhigh"');
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'ok');
    proc.emit('close', 0);
    await promise;
  });

  it('parses JSON event lines and surfaces msg/message/text to onLog', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const logs: string[] = [];
    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: (t) => logs.push(t),
    });

    proc.stdout.emit('data', Buffer.from('{"msg":"working"}\n'));
    proc.stdout.emit('data', Buffer.from('{"type":"command","command":"ls"}\n'));
    const args = spawnMock.mock.calls[0][1] as string[];
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'done');
    proc.emit('close', 0);
    await promise;

    expect(logs.some(log => log.includes('working'))).toBe(true);
    expect(logs.some(log => log.includes('[command] ls'))).toBe(true);
  });

  it('rejects when exit is non-zero even if output file has content', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'partial');
    proc.stderr.emit('data', Buffer.from('crash\n'));
    proc.emit('close', 1);
    await expect(promise).rejects.toThrow(/codex exited with code 1/);
  });

  it('rejects on empty output file even with exit code 0', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    // intentionally do not write the output file
    proc.emit('close', 0);
    await expect(promise).rejects.toThrow(/codex produced no output/);
  });

  it('cleans up the output file after successful read', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    const outputPath = args[args.indexOf('--output-last-message') + 1];
    writeFileSync(outputPath, 'ok');
    proc.emit('close', 0);
    await promise;
    expect(existsSync(outputPath)).toBe(false);
  });

  it('silently drops valid JSON events with no known message field', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const logs: string[] = [];
    const { codexDriver } = await import('./codex-driver.js');
    const promise = codexDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: (t) => logs.push(t),
    });

    // Events that have no msg/message/text/type+command — original dropped these silently
    proc.stdout.emit('data', Buffer.from('{"id":"abc","type":"task_started"}\n'));
    proc.stdout.emit('data', Buffer.from('{"seq":42}\n'));
    // A recognized event should still log
    proc.stdout.emit('data', Buffer.from('{"msg":"working"}\n'));
    // Invalid JSON should fall through to raw-line logging
    proc.stdout.emit('data', Buffer.from('not json at all\n'));

    const args = spawnMock.mock.calls[0][1] as string[];
    writeFileSync(args[args.indexOf('--output-last-message') + 1], 'done');
    proc.emit('close', 0);
    await promise;

    const joined = logs.join('');
    // Unknown-shape events must not appear in logs
    expect(joined).not.toContain('task_started');
    expect(joined).not.toContain('seq');
    expect(joined).not.toContain('"id":"abc"');
    // Known event must appear
    expect(joined).toContain('working');
    // Invalid JSON must fall through as raw
    expect(joined).toContain('not json at all');
  });
});
