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

  it('treats exit code 1 as success when a result event arrives before the failure', async () => {
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

    proc.stdout.emit('data', Buffer.from('{"type":"result","duration_ms":12345}\n'));
    proc.emit('close', 1);
    await expect(promise).resolves.toContain('[done] Phase complete');
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

  it('formats result events with duration suffix', async () => {
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

    proc.stdout.emit('data', Buffer.from('{"type":"result","duration_ms":12345}\n'));
    proc.emit('close', 0);
    const result = await promise;
    expect(result).toContain('[done] Phase complete (12.3s)');
    expect(logs.some(l => l.includes('[done] Phase complete (12.3s)'))).toBe(true);
  });

  it('truncates Bash tool_use commands to 100 characters', async () => {
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

    const longCommand = 'echo ' + 'a'.repeat(500);
    const event = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Bash', input: { command: longCommand } },
        ],
      },
    };
    proc.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));
    proc.emit('close', 0);
    await promise;

    const bashLogs = logs.filter(l => l.startsWith('[Bash]'));
    expect(bashLogs.length).toBe(1);
    expect(bashLogs[0].length).toBeLessThanOrEqual(108); // "[Bash] " + 100 + "\n"
    expect(bashLogs[0]).toContain('[Bash] echo ');
    expect(bashLogs[0]).not.toContain('a'.repeat(200));
  });

  it('formats tool_use blocks per tool: Read/Glob/Grep prefer file_path then pattern then path; Edit/Write only file_path; others bare', async () => {
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

    const events = [
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a/b.ts' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'foo', path: 'src' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/c/d.ts', content: 'x' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: '/e/f.ts' } }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'TodoWrite', input: { todos: [] } }] } },
    ];
    for (const event of events) {
      proc.stdout.emit('data', Buffer.from(JSON.stringify(event) + '\n'));
    }
    proc.emit('close', 0);
    await promise;

    const joined = logs.join('');
    expect(joined).toContain('[Read] /a/b.ts');
    expect(joined).toContain('[Glob] **/*.ts');
    expect(joined).toContain('[Grep] foo');
    expect(joined).toContain('[Edit] /c/d.ts');
    expect(joined).toContain('[Write] /e/f.ts');
    // TodoWrite is a non-file-path tool: bare bracketed name, no trailing content
    expect(joined).toMatch(/\[TodoWrite\](\n|$)/);
  });

  it('returns raw stdout when no events are recognized and falls back to Completed for empty stdout', async () => {
    // Unrecognized events: return value is the raw stdout accumulation
    const proc1 = new MockProc();
    spawnMock.mockReturnValue(proc1);

    const logs: string[] = [];
    const { claudeDriver } = await import('./claude-driver.js');
    const promise1 = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: (t) => logs.push(t),
    });

    proc1.stdout.emit('data', Buffer.from('{"type":"system","message":"init"}\n'));
    proc1.emit('close', 0);
    const result1 = await promise1;

    // No formatted events → collected is empty → falls back to raw stdout
    expect(logs.length).toBe(0);
    expect(result1).toContain('"type":"system"');

    // Completely empty stdout → falls back to "Completed"
    const proc2 = new MockProc();
    spawnMock.mockReturnValue(proc2);
    const promise2 = claudeDriver.execute({
      jobId: 'j2',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });
    proc2.emit('close', 0);
    expect(await promise2).toBe('Completed');
  });

  it('omits tool flags entirely when step.tools is empty', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: [] }),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    // With an empty tools list, no --allowedTools flag should appear
    expect(args).not.toContain('--allowedTools');
    // And no --disallowedTools either (only added when tools.length > 0)
    expect(args).not.toContain('--disallowedTools');

    proc.emit('close', 0);
    await promise;
  });

  it('rethrows cancellation even when the done marker was already streamed', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { markJobCanceled, clearJobCancellation } = await import('../process-lifecycle.js');
    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'job-cancel-race',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });

    // Emit the result event so the DONE marker lands in `collected`
    proc.stdout.emit('data', Buffer.from('{"type":"result","duration_ms":5000}\n'));
    // Mark the job canceled and then close — runProcess will reject with "Job canceled"
    markJobCanceled('job-cancel-race');
    proc.emit('close', 137);

    await expect(promise).rejects.toThrow(/Job canceled/);
    clearJobCancellation('job-cancel-race');
  });

  it('rethrows timeout even when the done marker was already streamed', async () => {
    vi.useFakeTimers();
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { claudeDriver } = await import('./claude-driver.js');
    const promise = claudeDriver.execute({
      jobId: 'job-timeout-race',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'X',
      onLog: () => {},
    });
    const settled = promise.catch(err => err);

    // Emit the result event
    proc.stdout.emit('data', Buffer.from('{"type":"result","duration_ms":5000}\n'));

    // Advance past the default 30-minute timeout
    await vi.advanceTimersByTimeAsync(31 * 60 * 1000);

    // Close after the timeout fires
    proc.emit('close', 143);

    const result = await settled;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/timed out/);
    vi.useRealTimers();
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
