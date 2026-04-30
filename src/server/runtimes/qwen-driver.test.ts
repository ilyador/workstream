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

function jsonLine(value: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`);
}

function argValue(args: string[], flag: string): string {
  const idx = args.indexOf(flag);
  expect(idx).toBeGreaterThanOrEqual(0);
  return args[idx + 1];
}

describe('QwenDriver', () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it('spawns qwen with stream-json output, partial messages, and yolo approval', async () => {
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
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args).toContain('--include-partial-messages');
    expect(args).toContain('--approval-mode');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo');
    expect(argValue(args, '--max-session-turns')).toBe('24');

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'done' }));
    proc.emit('close', 0);
    await promise;
  });

  it('passes the prompt on stdin instead of argv', async () => {
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
    expect(args).not.toContain('--prompt');
    expect(proc.stdin.write).toHaveBeenCalledWith('implement the feature');
    expect(proc.stdin.end).toHaveBeenCalled();

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'implemented' }));
    proc.emit('close', 0);
    await promise;
  });

  it('limits Qwen tools to the tools configured on the flow step', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob'] }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    const coreTools = argValue(args, '--core-tools').split(',');
    expect(coreTools).toEqual([
      'read_file',
      'list_directory',
      'edit',
      'write_file',
      'run_shell_command',
      'grep_search',
      'glob',
    ]);
    expect(argValue(args, '--allowed-tools')).toBe(coreTools.join(','));

    const excludedTools = argValue(args, '--exclude-tools').split(',');
    expect(excludedTools).toContain('agent');
    expect(excludedTools).toContain('skill');
    expect(excludedTools).toContain('todo_write');
    expect(excludedTools).toContain('ask_user_question');
    expect(excludedTools).toContain('web_fetch');
    expect(excludedTools).not.toContain('read_file');
    expect(excludedTools).not.toContain('edit');
    expect(excludedTools).not.toContain('write_file');
    expect(excludedTools).not.toContain('run_shell_command');
    expect(excludedTools).not.toContain('grep_search');
    expect(excludedTools).not.toContain('glob');

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'ok' }));
    proc.emit('close', 0);
    await promise;
  });

  it('does not add tool restrictions when the flow step has no tool list', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: [] }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('--core-tools');
    expect(args).not.toContain('--allowed-tools');
    expect(args).not.toContain('--exclude-tools');

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'ok' }));
    proc.emit('close', 0);
    await promise;
  });

  it('sets QWEN_CODE_NO_RELAUNCH env var', async () => {
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

    const env = spawnMock.mock.calls[0][2].env;
    expect(env.QWEN_CODE_NO_RELAUNCH).toBe('true');

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'ok' }));
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
    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'ok' }));
    proc.emit('close', 0);
    await promise;
  });

  it('resolves with the trimmed result event text on clean exit', async () => {
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

    proc.stdout.emit('data', jsonLine({ type: 'result', result: '  final answer  ' }));
    proc.emit('close', 0);
    await expect(promise).resolves.toBe('final answer');
  });

  it('falls back to final assistant text when the result event has no text', async () => {
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

    proc.stdout.emit('data', jsonLine({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'assistant answer' }] },
    }));
    proc.stdout.emit('data', jsonLine({ type: 'result', result: '' }));
    proc.emit('close', 0);
    await expect(promise).resolves.toBe('assistant answer');
  });

  it('collects text deltas and can return partial text if no final event is emitted', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);
    const onLog = vi.fn();

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'x',
      onLog,
    });

    proc.stdout.emit('data', jsonLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'part' } },
    }));
    proc.stdout.emit('data', jsonLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ial' } },
    }));
    proc.emit('close', 0);

    await expect(promise).resolves.toBe('partial');
    expect(onLog).toHaveBeenCalledWith('[qwen] responding...\n');
    expect(onLog).not.toHaveBeenCalledWith('part');
    expect(onLog).not.toHaveBeenCalledWith('ial');
  });

  it('rejects when qwen only emits hidden thinking and no final text', async () => {
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

    proc.stdout.emit('data', jsonLine({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hidden' } },
    }));
    proc.emit('close', 0);
    await expect(promise).rejects.toThrow(/qwen produced no output/);
  });

  it('uses structured output without partial messages for summaries', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.summarize({
      jobId: 'j1',
      step: baseStep(),
      cwd: '/work',
      prompt: 'summarize',
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args).not.toContain('--include-partial-messages');
    expect(argValue(args, '--max-session-turns')).toBe('1');
    expect(spawnMock.mock.calls[0][2].env.QWEN_CODE_NO_RELAUNCH).toBe('true');
    expect(proc.stdin.write).toHaveBeenCalledWith('summarize');

    proc.stdout.emit('data', jsonLine({ type: 'result', result: 'summary' }));
    proc.emit('close', 0);
    await expect(promise).resolves.toBe('summary');
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
