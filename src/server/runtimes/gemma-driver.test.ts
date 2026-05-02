import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function baseStep(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'step-1',
    name: 'Code',
    runtime_kind: 'coding',
    runtime_id: 'gemma_code',
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
    max_retries: 0,
    is_gate: false,
    on_fail_jump_to: null,
    on_max_retries: 'fail',
    position: 1,
    instructions: 'Do it',
    use_project_data: false,
    ...overrides,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

function jsonResponse(value: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0): Record<string, any> {
  return JSON.parse(fetchMock.mock.calls[index][1].body as string);
}

describe('GemmaDriver', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'gemma-driver-test-'));
    process.env = {
      ...originalEnv,
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      OLLAMA_API_KEY: 'ollama-local',
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = originalEnv;
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('calls the native Ollama chat API with the default Gemma 4 model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: 'done' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'do it',
      onLog: () => {},
    })).resolves.toBe('done');

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    const body = requestBody(fetchMock);
    expect(body.model).toBe('gemma4:e4b');
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0.1);
    expect(body.options.num_ctx).toBe(128000);
    expect(body.tools).toEqual([]);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'do it' });
  });

  it('uses runtime_variant and normalizes Ollama host URLs', async () => {
    process.env = {
      ...process.env,
      OPENAI_BASE_URL: undefined,
      OLLAMA_HOST: 'http://127.0.0.1:11434/',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: 'ok' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep({ runtime_variant: 'gemma4:26b' }),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'x',
      onLog: () => {},
    });

    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
    const body = requestBody(fetchMock);
    expect(body.model).toBe('gemma4:26b');
    expect(body.options.num_ctx).toBe(256000);
    expect(body.options.num_predict).toBe(16384);
  });

  it('executes Gemma write_file tool calls and returns the final assistant text', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-1',
            function: {
              name: 'write_file',
              arguments: { path: 'hello.txt', content: 'ok\n' },
            },
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        message: { role: 'assistant', content: '[summary] created file' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const logs: string[] = [];

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: ['Write'] }),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'create hello',
      onLog: text => logs.push(text),
    })).resolves.toBe('[summary] created file');

    expect(readFileSync(join(tempDir, 'hello.txt'), 'utf-8')).toBe('ok\n');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock).tools.map((tool: any) => tool.function.name)).toEqual(['write_file']);
    expect(requestBody(fetchMock, 1).messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'wrote hello.txt (3 bytes)',
    });
    expect(logs.join('')).toContain('[gemma:write_file hello.txt]');
  });

  it('summarizes without exposing file tools', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: 'summary' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.summarize({
      jobId: 'j1',
      step: baseStep({ tools: ['Write'] }),
      cwd: tempDir,
      prompt: 'summarize',
    })).resolves.toBe('summary');

    expect(requestBody(fetchMock).tools).toEqual([]);
  });

  it('rejects when Ollama returns no assistant output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      message: { role: 'assistant', content: '' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'x',
      onLog: () => {},
    })).rejects.toThrow(/gemma produced no output/);
  });

  it('reports Ollama request aborts as Gemma timeouts', async () => {
    const abortError = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'x',
      onLog: () => {},
    })).rejects.toThrow(/gemma request timed out after .* waiting for Ollama/);
  });

  it('stops when Gemma repeats file tools on the same target', async () => {
    writeFileSync(join(tempDir, 'loop.txt'), 'same\n');
    let callIndex = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callIndex += 1;
      return Promise.resolve(jsonResponse({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: `call-${callIndex}`,
            function: {
              name: 'read_file',
              arguments: { path: 'loop.txt' },
            },
          }],
        },
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { gemmaDriver } = await import('./gemma-driver.js');
    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep({ tools: ['Read'] }),
      task: { effort: null },
      cwd: tempDir,
      prompt: 'loop',
      onLog: () => {},
    })).rejects.toThrow(/gemma appears stuck repeatedly using tools on file:loop\.txt/);
  });

  it('rejects when the working directory is missing', async () => {
    const { gemmaDriver } = await import('./gemma-driver.js');
    const missingDir = join(tempDir, 'missing');
    expect(existsSync(missingDir)).toBe(false);

    await expect(gemmaDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: missingDir,
      prompt: 'x',
      onLog: () => {},
    })).rejects.toThrow(/Working directory does not exist/);
  });
});
