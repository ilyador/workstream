# Runtime Driver Refactor — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract per-runtime execution logic from the 1231-line `runner.ts` monolith into a driver registry that dispatches by runtime ID, fixing a security issue (env var leak), a correctness issue (missing timeouts on codex/qwen), and the open/closed violation where dispatch is hardcoded in two switch statements.

**Architecture:** A `RuntimeDriver` interface with per-runtime implementations (`claude-driver`, `codex-driver`, `qwen-driver`), each built on top of a shared `runProcess` helper that handles the common spawn plumbing (stdin, stdout/stderr line buffering, timeout, SIGTERM→SIGKILL escalation, cancellation). A small `registry` maps runtime IDs to drivers and exposes `executeFlowStep()` + `summarize()` as the single dispatch point. Process lifecycle state (the `activeProcesses` map and cancel machinery) moves to its own module so the drivers can use it without a circular dep back into `runner.ts`.

**Tech Stack:** TypeScript (ESM, `"type": "module"` — imports use `.js` extension), Node `child_process.spawn`, vitest for tests (`pnpm test`), Supabase mocked in tests per project convention (see `MEMORY.md` — "tests must mock the database, never hit real/local Supabase").

**Prerequisite:** Per `CLAUDE.md`, feature branches must live in git worktrees. Before starting, create one: `git worktree add ../workstream-runtime-drivers -b workstream/runtime-drivers`. All tasks below assume you're working in that worktree.

**Out of scope (follow-up plans):**
- Phase 2: extract `buildStepPrompt` (238 lines) and `runFlowJob` (250 lines) into `src/server/flow/`.
- Phase 3: extract `scanAndUploadArtifacts`, `updateRunningJob`, `savePhases`, etc. into `src/server/jobs/`.
- Frontend loading-state plumbing for `FlowStepFormFields`.

---

## File Structure

**New files:**

- `src/server/process-lifecycle.ts` — shared `activeProcesses` map, `registerActiveProcess`, `unregisterActiveProcess`, `terminateProcess`, `cancelJob`, `cancelAllJobs`. One source of truth for tracking running child processes.
- `src/server/process-lifecycle.test.ts` — unit tests for register/unregister/cancel semantics.
- `src/server/runtimes/types.ts` — `RuntimeDriver` interface, `ExecuteStepOptions`, `SummarizeOptions`.
- `src/server/runtimes/env.ts` — `buildRuntimeEnv(runtimeId)` with per-runtime secret allowlist (replaces `claudeEnv` spreading all of `process.env`).
- `src/server/runtimes/env.test.ts` — allowlist tests asserting non-forwarded secrets.
- `src/server/runtimes/process-runner.ts` — `runProcess(opts)` shared spawn helper: stdin, line-buffered stdout/stderr, 30-minute default timeout with `SIGTERM`→`SIGKILL` escalation, cancellation via `canceledJobs`.
- `src/server/runtimes/process-runner.test.ts` — tests for spawn invocation, timeout, cancel, stdin write, line buffering.
- `src/server/runtimes/claude-driver.ts` — `ClaudeDriver` implementing `RuntimeDriver`. Parses `stream-json` events via `formatStreamEvent` (moved from `runner.ts`). Accepts the `[done] Phase complete` exit-1-as-success escape hatch.
- `src/server/runtimes/claude-driver.test.ts` — arg builder + parser tests.
- `src/server/runtimes/codex-driver.ts` — `CodexDriver`. Takes `outputPath` as a real parameter (not extracted from argv). Rejects on non-zero exit even if the temp file is empty (fixes silent-failure bug). Parses JSON line events.
- `src/server/runtimes/codex-driver.test.ts` — arg builder + parser + atomic-read tests.
- `src/server/runtimes/qwen-driver.ts` — `QwenDriver`. Pipes the prompt via stdin (fixes `ARG_MAX` risk and `ps` leak). Raw stdout accumulation.
- `src/server/runtimes/qwen-driver.test.ts` — arg builder + spawn tests.
- `src/server/runtimes/registry.ts` — `Map<AiRuntimeId, RuntimeDriver>`, `executeFlowStep(opts)`, `summarize(opts)`. Throws on unknown runtime.
- `src/server/runtimes/registry.test.ts` — dispatch tests.
- `src/server/runtimes/index.ts` — barrel: re-exports `executeFlowStep`, `summarize`, types.

**Modified files:**

- `src/server/runner.ts` — deletes `claudeEnv`, `buildClaudeArgs`, `buildCodexArgs`, `buildQwenArgs`, `codexEffortLevel`, `runStepWithRuntime`, `generateSummary` (including the inline Claude spawn block), `spawnClaude`, `spawnCodex`, `spawnQwen`, `formatStreamEvent`, `activeProcesses`/`canceledJobs`/`register`/`unregister`/`terminateProcess`/`cancelJob`/`cancelAllJobs`. Re-exports `cancelJob`/`cancelAllJobs` from `process-lifecycle.ts`. Calls `executeFlowStep`/`summarize` from the registry. Target size after: **~750 lines** (down from 1231).
- `src/server/ai-runtime-discovery.ts` — `execFileSync` → `execFile` (promisified). `getDetectedAiRuntimes()`/`refreshDetectedAiRuntimes()` become async. Avoids blocking the event loop.
- `src/server/ai-runtime-discovery.test.ts` — updated for the async API.
- `src/server/index.ts` — awaits `refreshDetectedAiRuntimes()` at startup.
- `src/server/worker.ts` — awaits `refreshDetectedAiRuntimes()` wherever it's called.

---

## Task 1: Env allowlist module

Closes the security bug (`runner.ts:745-749` spreading all of `process.env` to every spawned runtime) with a per-runtime env builder that forwards only the specific secrets each CLI needs.

**Files:**
- Create: `src/server/runtimes/env.ts`
- Create: `src/server/runtimes/env.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/server/runtimes/env.test.ts`:

```ts
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
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/env.test.ts`
Expected: FAIL — `Cannot find module './env.js'`.

- [ ] **Step 1.3: Implement the module**

Create `src/server/runtimes/env.ts`:

```ts
import type { AiRuntimeId } from '../../shared/ai-runtimes.js';

const BASE_ENV_KEYS = ['HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'] as const;

const RUNTIME_SECRET_KEYS: Record<AiRuntimeId, readonly string[]> = {
  claude_code: ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR'],
  codex: ['OPENAI_API_KEY', 'CODEX_CONFIG_DIR'],
  qwen_code: ['DASHSCOPE_API_KEY', 'QWEN_CONFIG_DIR'],
};

export function buildRuntimeEnv(runtimeId: AiRuntimeId): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { TERM: 'dumb' };

  for (const key of BASE_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  const homePath = process.env.HOME ?? '';
  const originalPath = process.env.PATH ?? '';
  env.PATH = `${homePath}/.local/bin:${originalPath}`;

  for (const key of RUNTIME_SECRET_KEYS[runtimeId] ?? []) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }

  return env;
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/env.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 1.5: Commit**

```bash
git add src/server/runtimes/env.ts src/server/runtimes/env.test.ts
git commit -m "Add per-runtime env allowlist to replace process.env spread"
```

---

## Task 2: Process lifecycle module

Moves the activeProcesses map and cancel machinery to its own file so drivers can use it without circular imports. `runner.ts` re-exports `cancelJob`/`cancelAllJobs` to preserve the public API.

**Files:**
- Create: `src/server/process-lifecycle.ts`
- Create: `src/server/process-lifecycle.test.ts`
- Modify: `src/server/runner.ts` — delete duplicated code, re-export from new module.

- [ ] **Step 2.1: Write the failing test**

Create `src/server/process-lifecycle.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  registerActiveProcess,
  unregisterActiveProcess,
  isJobCanceled,
  markJobCanceled,
  clearJobCancellation,
  cancelJob,
  cancelAllJobs,
  getActiveProcessCount,
} from './process-lifecycle.js';
import type { ChildProcess } from 'child_process';

class MockProc extends EventEmitter {
  killed = false;
  killCalls: string[] = [];
  kill(signal?: string) {
    this.killCalls.push(signal ?? 'SIGTERM');
    this.killed = true;
    setTimeout(() => this.emit('close', 0), 0);
    return true;
  }
}

function makeProc(): ChildProcess {
  return new MockProc() as unknown as ChildProcess;
}

describe('process-lifecycle', () => {
  beforeEach(() => {
    cancelAllJobs();
  });

  it('registers and unregisters processes by jobId', () => {
    const proc = makeProc();
    registerActiveProcess('job-1', proc);
    expect(getActiveProcessCount('job-1')).toBe(1);
    unregisterActiveProcess('job-1', proc);
    expect(getActiveProcessCount('job-1')).toBe(0);
  });

  it('tracks multiple processes under the same jobId', () => {
    const a = makeProc();
    const b = makeProc();
    registerActiveProcess('job-1', a);
    registerActiveProcess('job-1', b);
    expect(getActiveProcessCount('job-1')).toBe(2);
    unregisterActiveProcess('job-1', a);
    expect(getActiveProcessCount('job-1')).toBe(1);
  });

  it('marks and clears job cancellation', () => {
    expect(isJobCanceled('job-1')).toBe(false);
    markJobCanceled('job-1');
    expect(isJobCanceled('job-1')).toBe(true);
    clearJobCancellation('job-1');
    expect(isJobCanceled('job-1')).toBe(false);
  });

  it('cancelJob terminates all active processes for that job', async () => {
    const a = new MockProc();
    const b = new MockProc();
    registerActiveProcess('job-1', a as unknown as ChildProcess);
    registerActiveProcess('job-1', b as unknown as ChildProcess);
    await cancelJob('job-1');
    expect(a.killCalls).toContain('SIGTERM');
    expect(b.killCalls).toContain('SIGTERM');
    expect(getActiveProcessCount('job-1')).toBe(0);
  });

  it('cancelJob is a no-op when there are no active processes', async () => {
    await expect(cancelJob('unknown-job')).resolves.toBeUndefined();
  });

  it('cancelAllJobs kills processes across all jobs', async () => {
    const a = new MockProc();
    const b = new MockProc();
    registerActiveProcess('job-1', a as unknown as ChildProcess);
    registerActiveProcess('job-2', b as unknown as ChildProcess);
    cancelAllJobs();
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(a.killCalls.length).toBeGreaterThan(0);
    expect(b.killCalls.length).toBeGreaterThan(0);
  });

  it('escalates to SIGKILL if process does not close within 5s', async () => {
    vi.useFakeTimers();
    const stubborn = new MockProc();
    stubborn.kill = function(signal?: string) {
      this.killCalls.push(signal ?? 'SIGTERM');
      return true;
    };
    registerActiveProcess('job-1', stubborn as unknown as ChildProcess);
    const cancelPromise = cancelJob('job-1');
    await vi.advanceTimersByTimeAsync(5100);
    expect(stubborn.killCalls).toContain('SIGTERM');
    expect(stubborn.killCalls).toContain('SIGKILL');
    stubborn.emit('close', 0);
    await cancelPromise;
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `pnpm test src/server/process-lifecycle.test.ts`
Expected: FAIL — `Cannot find module './process-lifecycle.js'`.

- [ ] **Step 2.3: Implement the module**

Create `src/server/process-lifecycle.ts`:

```ts
import type { ChildProcess } from 'child_process';

const activeProcesses = new Map<string, Set<ChildProcess>>();
const canceledJobs = new Set<string>();

export function registerActiveProcess(jobId: string, proc: ChildProcess): void {
  const processes = activeProcesses.get(jobId) ?? new Set<ChildProcess>();
  processes.add(proc);
  activeProcesses.set(jobId, processes);
}

export function unregisterActiveProcess(jobId: string, proc: ChildProcess): void {
  const processes = activeProcesses.get(jobId);
  if (!processes) return;
  processes.delete(proc);
  if (processes.size === 0) activeProcesses.delete(jobId);
}

export function getActiveProcessCount(jobId: string): number {
  return activeProcesses.get(jobId)?.size ?? 0;
}

export function isJobCanceled(jobId: string): boolean {
  return canceledJobs.has(jobId);
}

export function markJobCanceled(jobId: string): void {
  canceledJobs.add(jobId);
}

export function clearJobCancellation(jobId: string): void {
  canceledJobs.delete(jobId);
}

function terminateProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    let closed = false;
    let escalate: ReturnType<typeof setTimeout> | null = null;
    let fallback: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (closed) return;
      closed = true;
      if (escalate) clearTimeout(escalate);
      if (fallback) clearTimeout(fallback);
      resolve();
    };

    proc.once('close', finish);
    try { proc.kill('SIGTERM'); } catch { finish(); return; }
    escalate = setTimeout(() => {
      if (!closed) {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }
    }, 5000);
    fallback = setTimeout(finish, 6000);
  });
}

export async function cancelJob(jobId: string): Promise<void> {
  const processes = activeProcesses.get(jobId);
  if (!processes || processes.size === 0) return;
  markJobCanceled(jobId);
  await Promise.all([...processes].map(terminateProcess));
  activeProcesses.delete(jobId);
  clearJobCancellation(jobId);
}

export function cancelAllJobs(): void {
  for (const [jobId, processes] of activeProcesses) {
    activeProcesses.delete(jobId);
    for (const proc of processes) terminateProcess(proc).catch(() => {});
  }
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `pnpm test src/server/process-lifecycle.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 2.5: Update runner.ts to use the new module**

Edit `src/server/runner.ts`:

1. Replace the lifecycle code at `runner.ts:753-807`. Delete lines 753-807 (the block containing `activeProcesses`, `canceledJobs`, `registerActiveProcess`, `unregisterActiveProcess`, `terminateProcess`, `cancelJob`, `cancelAllJobs`).

2. At the top of the file, add to the imports:

```ts
import {
  registerActiveProcess,
  unregisterActiveProcess,
  isJobCanceled,
  cancelJob as cancelJobImpl,
  cancelAllJobs as cancelAllJobsImpl,
} from './process-lifecycle.js';
```

3. Replace any in-file references to `canceledJobs.has(jobId)` with `isJobCanceled(jobId)`. There are ~5 call sites inside `spawnClaude`, `spawnCodex`, `spawnQwen`, and `generateSummary` — do them all.

4. Add at the bottom of the file (to preserve the public API):

```ts
export const cancelJob = cancelJobImpl;
export const cancelAllJobs = cancelAllJobsImpl;
```

- [ ] **Step 2.6: Run the full runner test suite to verify parity**

Run: `pnpm test src/server/runner.test.ts src/server/process-lifecycle.test.ts`
Expected: PASS. No runner behavior changes, only internal wiring.

- [ ] **Step 2.7: Commit**

```bash
git add src/server/process-lifecycle.ts src/server/process-lifecycle.test.ts src/server/runner.ts
git commit -m "Extract process lifecycle to dedicated module"
```

---

## Task 3: Runtime types + process-runner

Creates the `RuntimeDriver` interface and the shared `runProcess` helper that collapses ~80% of `spawnClaude`/`spawnCodex`/`spawnQwen` into one place. Adds the 30-minute default timeout to all runtimes (fixing the hang risk for codex and qwen).

**Files:**
- Create: `src/server/runtimes/types.ts`
- Create: `src/server/runtimes/process-runner.ts`
- Create: `src/server/runtimes/process-runner.test.ts`

- [ ] **Step 3.1: Write the types file**

Create `src/server/runtimes/types.ts`:

```ts
import type { AiRuntimeId } from '../../shared/ai-runtimes.js';
import type { FlowStepConfig } from '../flow-config.js';

export interface ExecuteStepOptions {
  jobId: string;
  step: FlowStepConfig;
  task: { effort?: string | null };
  cwd: string;
  prompt: string;
  onLog: (text: string) => void;
}

export interface SummarizeOptions {
  jobId: string;
  step: FlowStepConfig;
  cwd: string;
  prompt: string;
}

export interface RuntimeDriver {
  readonly id: AiRuntimeId;
  execute(opts: ExecuteStepOptions): Promise<string>;
  summarize(opts: SummarizeOptions): Promise<string>;
}
```

- [ ] **Step 3.2: Write the failing test for process-runner**

Create `src/server/runtimes/process-runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

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

    await vi.advanceTimersByTimeAsync(1100);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    await promise.catch(() => {});
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

    await vi.advanceTimersByTimeAsync(DEFAULT_PROCESS_TIMEOUT_MS + 100);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    await promise.catch(() => {});
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
```

- [ ] **Step 3.3: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/process-runner.test.ts`
Expected: FAIL — `Cannot find module './process-runner.js'`.

- [ ] **Step 3.4: Implement process-runner**

Create `src/server/runtimes/process-runner.ts`:

```ts
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import {
  registerActiveProcess,
  unregisterActiveProcess,
  isJobCanceled,
} from '../process-lifecycle.js';

export const DEFAULT_PROCESS_TIMEOUT_MS = 30 * 60 * 1000;

export interface RunProcessOptions {
  jobId: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs?: number;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
  onLog: (text: string) => void;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function runProcess(opts: RunProcessOptions): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_PROCESS_TIMEOUT_MS;

    const proc: ChildProcess = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    registerActiveProcess(opts.jobId, proc);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let stdoutLineBuffer = '';
    let stderrLineBuffer = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      opts.onLog(`[runner] Process ${opts.command} timed out after ${timeoutMs / 60000}m — killing\n`);
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* already dead */ }
      }, 5000);
    }, timeoutMs);

    const flushLines = (buffer: string, stream: 'stdout' | 'stderr'): string => {
      const lines = buffer.split('\n');
      const remainder = lines.pop() ?? '';
      for (const line of lines) {
        if (line) opts.onLine(line, stream);
      }
      return remainder;
    };

    if (proc.stdin) {
      proc.stdin.on('error', (err: Error) => {
        opts.onLog(`[runner] stdin error for ${opts.command} (job ${opts.jobId}): ${err.message}\n`);
      });
      if (opts.stdin !== undefined) {
        proc.stdin.write(opts.stdin);
        proc.stdin.end();
      }
    }

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      stdoutBuffer += text;
      stdoutLineBuffer = flushLines(stdoutLineBuffer + text, 'stdout');
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrBuffer += text;
      stderrLineBuffer = flushLines(stderrLineBuffer + text, 'stderr');
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stdoutLineBuffer) opts.onLine(stdoutLineBuffer, 'stdout');
      if (stderrLineBuffer) opts.onLine(stderrLineBuffer, 'stderr');
      unregisterActiveProcess(opts.jobId, proc);

      if (isJobCanceled(opts.jobId)) {
        reject(new Error('Job canceled'));
        return;
      }
      if (timedOut) {
        reject(new Error(`${opts.command} timed out after ${timeoutMs / 60000}m`));
        return;
      }
      const exitCode = code ?? 0;
      if (exitCode === 0) {
        resolve({ stdout: stdoutBuffer, stderr: stderrBuffer, exitCode });
        return;
      }
      const stderrTail = stderrBuffer.trim().split('\n').slice(-10).join('\n');
      const detail = stderrTail ? `\n${stderrTail}` : '';
      reject(new Error(`${opts.command} exited with code ${exitCode}${detail}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      unregisterActiveProcess(opts.jobId, proc);
      reject(err);
    });
  });
}
```

- [ ] **Step 3.5: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/process-runner.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 3.6: Commit**

```bash
git add src/server/runtimes/types.ts src/server/runtimes/process-runner.ts src/server/runtimes/process-runner.test.ts
git commit -m "Add shared process runner with default 30m timeout"
```

---

## Task 4: Claude driver

Moves `buildClaudeArgs`, `formatStreamEvent`, and the Claude-specific spawn logic into a driver. Preserves the two Claude-only behaviors: stream-json parsing and the `[done] Phase complete` exit-1-as-success escape.

**Files:**
- Create: `src/server/runtimes/claude-driver.ts`
- Create: `src/server/runtimes/claude-driver.test.ts`

- [ ] **Step 4.1: Write the failing test**

Create `src/server/runtimes/claude-driver.test.ts`:

```ts
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
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/claude-driver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Implement the driver**

Create `src/server/runtimes/claude-driver.ts`:

```ts
import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];
const DONE_PHASE_MARKER = '[done] Phase complete';

function buildArgs(step: FlowStepConfig, task: { effort?: string | null }): string[] {
  const args = ['-p', '--verbose', '--output-format', 'stream-json'];
  if (step.tools.length > 0) {
    args.push('--allowedTools', step.tools.join(','));
    const blocked = WRITE_TOOLS.filter(tool => !step.tools.includes(tool));
    if (blocked.length > 0) args.push('--disallowedTools', blocked.join(','));
  }
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  if (task.effort) args.push('--effort', task.effort);
  return args;
}

function formatStreamEvent(line: string): string | null {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type !== 'assistant') return null;
    const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
    if (!message?.content) return null;
    const parts: string[] = [];
    for (const block of message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      } else if (block.type === 'tool_use' && typeof block.name === 'string') {
        const input = block.input as Record<string, unknown> | undefined;
        const hint = input?.file_path ?? input?.path ?? input?.command ?? input?.pattern ?? '';
        parts.push(`[${block.name}] ${hint}`.trim());
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  } catch {
    return null;
  }
}

export const claudeDriver: RuntimeDriver = {
  id: 'claude_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const args = buildArgs(opts.step, opts.task);
    const collected: string[] = [];

    try {
      const result = await runProcess({
        jobId: opts.jobId,
        command: 'claude',
        args,
        cwd: opts.cwd,
        env: buildRuntimeEnv('claude_code'),
        stdin: opts.prompt,
        onLine: (line, stream) => {
          if (stream === 'stdout') {
            const formatted = formatStreamEvent(line);
            if (formatted) {
              collected.push(formatted);
              opts.onLog(`${formatted}\n`);
            }
          } else {
            opts.onLog(`${line}\n`);
          }
        },
        onLog: opts.onLog,
      });
      return collected.join('\n') || result.stdout.trim() || 'Completed';
    } catch (err) {
      const collectedText = collected.join('\n');
      if (collectedText.includes(DONE_PHASE_MARKER)) {
        return collectedText;
      }
      throw err;
    }
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const model = opts.step.runtime_variant || 'sonnet';
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'claude',
      args: ['-p', '--output-format', 'text', '--max-turns', '1', '--model', model],
      cwd: opts.cwd,
      env: buildRuntimeEnv('claude_code'),
      stdin: opts.prompt,
      timeoutMs: 30_000,
      onLine: () => {},
      onLog: () => {},
    });
    return result.stdout.trim() || 'Completed';
  },
};
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/claude-driver.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 4.5: Commit**

```bash
git add src/server/runtimes/claude-driver.ts src/server/runtimes/claude-driver.test.ts
git commit -m "Add ClaudeDriver with arg building and stream-json parser"
```

---

## Task 5: Codex driver

Fixes two bugs while moving: (1) `outputPath` becomes a real parameter instead of being extracted from the argv via `findIndex('--output-last-message')`, and (2) the driver rejects on non-zero exit *or* empty output after success, instead of silently resolving with `''`.

**Files:**
- Create: `src/server/runtimes/codex-driver.ts`
- Create: `src/server/runtimes/codex-driver.test.ts`

- [ ] **Step 5.1: Write the failing test**

Create `src/server/runtimes/codex-driver.test.ts`:

```ts
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
});
```

- [ ] **Step 5.2: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/codex-driver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Implement the driver**

Create `src/server/runtimes/codex-driver.ts`:

```ts
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

function codexEffortLevel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value === 'max' ? 'xhigh' : value;
}

function allocateOutputPath(jobId: string, kind: 'step' | 'summary'): string {
  return join(tmpdir(), `workstream-codex-${kind}-${jobId}-${Date.now()}.txt`);
}

function buildArgs(
  step: FlowStepConfig,
  task: { effort?: string | null },
  cwd: string,
  outputPath: string,
): string[] {
  const trailing: string[] = [];
  if (step.runtime_variant) trailing.push('--model', step.runtime_variant);
  const effort = codexEffortLevel(task.effort);
  if (effort) trailing.push('-c', `model_reasoning_effort="${effort}"`);

  return [
    'exec',
    '--json',
    '--cd', cwd,
    '--dangerously-bypass-approvals-and-sandbox',
    '--output-last-message', outputPath,
    ...trailing,
    '-',
  ];
}

function formatCodexEvent(line: string): string | null {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (typeof event.msg === 'string') return event.msg;
    if (typeof event.message === 'string') return event.message;
    if (typeof event.text === 'string') return event.text;
    if (typeof event.type === 'string' && typeof event.command === 'string') {
      return `[${event.type}] ${event.command}`;
    }
    return null;
  } catch {
    return null;
  }
}

async function runCodex(
  jobId: string,
  args: string[],
  outputPath: string,
  cwd: string,
  prompt: string,
  onLog: (text: string) => void,
): Promise<string> {
  let caught: Error | null = null;
  try {
    await runProcess({
      jobId,
      command: 'codex',
      args,
      cwd,
      env: buildRuntimeEnv('codex'),
      stdin: prompt,
      onLine: (line, stream) => {
        if (stream === 'stdout') {
          const message = formatCodexEvent(line);
          onLog(`${message ?? line}\n`);
        } else {
          onLog(`${line}\n`);
        }
      },
      onLog,
    });
  } catch (err) {
    caught = err as Error;
  }

  let output = '';
  try {
    output = readFileSync(outputPath, 'utf8').trim();
  } catch {
    output = '';
  }
  try { unlinkSync(outputPath); } catch { /* ignore */ }

  if (caught) throw caught;
  if (!output) throw new Error('codex produced no output');
  return output;
}

export const codexDriver: RuntimeDriver = {
  id: 'codex',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const outputPath = allocateOutputPath(opts.jobId, 'step');
    const args = buildArgs(opts.step, opts.task, opts.cwd, outputPath);
    return runCodex(opts.jobId, args, outputPath, opts.cwd, opts.prompt, opts.onLog);
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const outputPath = allocateOutputPath(opts.jobId, 'summary');
    const args = buildArgs(opts.step, { effort: null }, opts.cwd, outputPath);
    return runCodex(opts.jobId, args, outputPath, opts.cwd, opts.prompt, () => {});
  },
};
```

- [ ] **Step 5.4: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/codex-driver.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5.5: Commit**

```bash
git add src/server/runtimes/codex-driver.ts src/server/runtimes/codex-driver.test.ts
git commit -m "Add CodexDriver with explicit outputPath and empty-output rejection"
```

---

## Task 6: Qwen driver

Fixes the prompt-via-argv bug by piping the prompt through stdin. Qwen's existing behavior of putting the prompt in `--prompt <text>` on the command line is visible in `ps` output and may hit `ARG_MAX` on long prompts.

**Files:**
- Create: `src/server/runtimes/qwen-driver.ts`
- Create: `src/server/runtimes/qwen-driver.test.ts`

- [ ] **Step 6.1: Write the failing test**

Create `src/server/runtimes/qwen-driver.test.ts`:

```ts
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

  it('does NOT pass the prompt as a command-line argument', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'SECRET-PROMPT',
      onLog: () => {},
    });

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain('SECRET-PROMPT');
    expect(args).not.toContain('--prompt');

    proc.emit('close', 0);
    await promise;
  });

  it('pipes the prompt via stdin', async () => {
    const proc = new MockProc();
    spawnMock.mockReturnValue(proc);

    const { qwenDriver } = await import('./qwen-driver.js');
    const promise = qwenDriver.execute({
      jobId: 'j1',
      step: baseStep(),
      task: { effort: null },
      cwd: '/work',
      prompt: 'pipe me',
      onLog: () => {},
    });

    expect(proc.stdin.write).toHaveBeenCalledWith('pipe me');
    expect(proc.stdin.end).toHaveBeenCalled();
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
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/qwen-driver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement the driver**

Create `src/server/runtimes/qwen-driver.ts`:

```ts
import type { FlowStepConfig } from '../flow-config.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { buildRuntimeEnv } from './env.js';
import { runProcess } from './process-runner.js';

function buildArgs(step: FlowStepConfig): string[] {
  const args = ['--output-format', 'text', '--approval-mode', 'yolo'];
  if (step.runtime_variant) args.push('--model', step.runtime_variant);
  return args;
}

export const qwenDriver: RuntimeDriver = {
  id: 'qwen_code',

  async execute(opts: ExecuteStepOptions): Promise<string> {
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'qwen',
      args: buildArgs(opts.step),
      cwd: opts.cwd,
      env: buildRuntimeEnv('qwen_code'),
      stdin: opts.prompt,
      onLine: (line, stream) => {
        if (line.trim()) opts.onLog(`${line}\n`);
      },
      onLog: opts.onLog,
    });
    return result.stdout.trim() || 'Completed';
  },

  async summarize(opts: SummarizeOptions): Promise<string> {
    const result = await runProcess({
      jobId: opts.jobId,
      command: 'qwen',
      args: buildArgs(opts.step),
      cwd: opts.cwd,
      env: buildRuntimeEnv('qwen_code'),
      stdin: opts.prompt,
      timeoutMs: 60_000,
      onLine: () => {},
      onLog: () => {},
    });
    return result.stdout.trim() || 'Completed';
  },
};
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/qwen-driver.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6.5: Commit**

```bash
git add src/server/runtimes/qwen-driver.ts src/server/runtimes/qwen-driver.test.ts
git commit -m "Add QwenDriver that pipes prompt via stdin instead of argv"
```

---

## Task 7: Registry + public surface

The registry maps `AiRuntimeId` → `RuntimeDriver` and exposes `executeFlowStep` / `summarize` as the single dispatch point.

**Files:**
- Create: `src/server/runtimes/registry.ts`
- Create: `src/server/runtimes/registry.test.ts`
- Create: `src/server/runtimes/index.ts`

- [ ] **Step 7.1: Write the failing test**

Create `src/server/runtimes/registry.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { RuntimeDriver } from './types.js';

vi.mock('../ai-runtime-discovery.js', () => ({
  requireDetectedAiRuntime: vi.fn((id: string) => ({ id, available: true, label: id })),
}));

const claudeExecute = vi.fn().mockResolvedValue('claude-result');
const codexExecute = vi.fn().mockResolvedValue('codex-result');
const qwenExecute = vi.fn().mockResolvedValue('qwen-result');

const claudeSummarize = vi.fn().mockResolvedValue('claude-summary');
const codexSummarize = vi.fn().mockResolvedValue('codex-summary');
const qwenSummarize = vi.fn().mockResolvedValue('qwen-summary');

vi.mock('./claude-driver.js', () => ({
  claudeDriver: { id: 'claude_code', execute: claudeExecute, summarize: claudeSummarize } as RuntimeDriver,
}));
vi.mock('./codex-driver.js', () => ({
  codexDriver: { id: 'codex', execute: codexExecute, summarize: codexSummarize } as RuntimeDriver,
}));
vi.mock('./qwen-driver.js', () => ({
  qwenDriver: { id: 'qwen_code', execute: qwenExecute, summarize: qwenSummarize } as RuntimeDriver,
}));

function stepWithRuntime(runtime_id: string) {
  return {
    id: 's1',
    name: 'step',
    runtime_kind: 'coding',
    runtime_id,
    runtime_variant: null,
    tools: [],
    context_sources: [],
    pipeline: null,
  } as unknown as import('../flow-config.js').FlowStepConfig;
}

describe('registry', () => {
  it('dispatches executeFlowStep to claudeDriver for claude_code', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('claude_code'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('claude-result');
    expect(claudeExecute).toHaveBeenCalled();
  });

  it('dispatches executeFlowStep to codexDriver for codex', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('codex'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('codex-result');
    expect(codexExecute).toHaveBeenCalled();
  });

  it('dispatches executeFlowStep to qwenDriver for qwen_code', async () => {
    const { executeFlowStep } = await import('./registry.js');
    const result = await executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('qwen_code'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    });
    expect(result).toBe('qwen-result');
    expect(qwenExecute).toHaveBeenCalled();
  });

  it('dispatches summarize to the correct driver', async () => {
    const { summarize } = await import('./registry.js');
    await expect(summarize({
      jobId: 'j1',
      step: stepWithRuntime('claude_code'),
      cwd: '/work',
      prompt: 'p',
    })).resolves.toBe('claude-summary');
    await expect(summarize({
      jobId: 'j1',
      step: stepWithRuntime('codex'),
      cwd: '/work',
      prompt: 'p',
    })).resolves.toBe('codex-summary');
  });

  it('throws when the step runtime_id has no registered driver', async () => {
    const { executeFlowStep } = await import('./registry.js');
    await expect(executeFlowStep({
      jobId: 'j1',
      step: stepWithRuntime('unknown_runtime'),
      task: { effort: null },
      cwd: '/work',
      prompt: 'p',
      onLog: () => {},
    })).rejects.toThrow(/Runtime driver not registered/);
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `pnpm test src/server/runtimes/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement the registry**

Create `src/server/runtimes/registry.ts`:

```ts
import type { AiRuntimeId } from '../../shared/ai-runtimes.js';
import { requireDetectedAiRuntime } from '../ai-runtime-discovery.js';
import type { RuntimeDriver, ExecuteStepOptions, SummarizeOptions } from './types.js';
import { claudeDriver } from './claude-driver.js';
import { codexDriver } from './codex-driver.js';
import { qwenDriver } from './qwen-driver.js';

const drivers = new Map<AiRuntimeId, RuntimeDriver>([
  ['claude_code', claudeDriver],
  ['codex', codexDriver],
  ['qwen_code', qwenDriver],
]);

function resolveDriver(runtimeId: string): RuntimeDriver {
  requireDetectedAiRuntime(runtimeId);
  const driver = drivers.get(runtimeId as AiRuntimeId);
  if (!driver) {
    throw new Error(`Runtime driver not registered: ${runtimeId}`);
  }
  return driver;
}

export function executeFlowStep(opts: ExecuteStepOptions): Promise<string> {
  return resolveDriver(opts.step.runtime_id).execute(opts);
}

export function summarize(opts: SummarizeOptions): Promise<string> {
  return resolveDriver(opts.step.runtime_id).summarize(opts);
}
```

- [ ] **Step 7.4: Create the barrel**

Create `src/server/runtimes/index.ts`:

```ts
export { executeFlowStep, summarize } from './registry.js';
export type {
  RuntimeDriver,
  ExecuteStepOptions,
  SummarizeOptions,
} from './types.js';
```

- [ ] **Step 7.5: Run test to verify it passes**

Run: `pnpm test src/server/runtimes/registry.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7.6: Commit**

```bash
git add src/server/runtimes/registry.ts src/server/runtimes/registry.test.ts src/server/runtimes/index.ts
git commit -m "Add runtime driver registry"
```

---

## Task 8: Flip runner.ts to use the registry

The big one. Replaces both dispatch switch statements, deletes the three `spawnXxx` functions, deletes the inline Claude spawn block in `generateSummary`, and deletes the `buildXxxArgs` / `codexEffortLevel` / `formatStreamEvent` / `claudeEnv` helpers that are now in drivers. `runner.ts` drops from 1231 to ~750 lines.

**Files:**
- Modify: `src/server/runner.ts`

- [ ] **Step 8.1: Read runner.ts line ranges to plan the deletion**

Run: `wc -l /home/sixbox/Dev/workstream/src/server/runner.ts`
Expected: 1231 lines.

Sections to delete (line numbers are pre-edit):
- 345-356: `buildClaudeArgs`
- 358-361: `codexEffortLevel`
- 363-376: `buildCodexArgs`
- 378-386: `buildQwenArgs`
- 388-407: `runStepWithRuntime`
- 745-749: `claudeEnv`
- 913-951: `formatStreamEvent`
- 954-1000: `generateSummary` (the whole function, including the inline Claude Promise block)
- 1002: `JOB_TIMEOUT_MS` constant (moved to process-runner as `DEFAULT_PROCESS_TIMEOUT_MS`)
- 1004-1109: `spawnClaude`
- 1111-1186: `spawnCodex`
- 1188-1231: `spawnQwen`

Keep: `buildStepPrompt` (105-342), `runFlowJob` (414-663), gate/verdict helpers (665-743), `scanAndUploadArtifacts` (18-71), `formatRagResults` (73-102), `summaryRuntimeStep` (409-411), DB helpers (816-911), `isJobStillRunning` (853-860 region).

- [ ] **Step 8.2: Add the new imports at the top of runner.ts**

Add to the import block at the top of `src/server/runner.ts`:

```ts
import { executeFlowStep, summarize } from './runtimes/index.js';
```

Remove any now-unused imports: `tmpdir`, `unlinkSync`, `readFileSync` (if only used by the deleted spawn functions), and anything else dead after the deletions. Keep `join`, `spawn`, etc. only if they're still referenced.

- [ ] **Step 8.3: Replace `runStepWithRuntime` call site inside `runFlowJob`**

Find the call inside `runFlowJob` that currently reads something like:
```ts
const output = await runStepWithRuntime(jobId, step, task, localPath, onLog, prompt);
```

Replace with:
```ts
const output = await executeFlowStep({
  jobId,
  step,
  task,
  cwd: localPath,
  prompt,
  onLog,
});
```

- [ ] **Step 8.4: Replace `generateSummary` call site**

Find the call inside `runFlowJob` that currently reads something like:
```ts
const summaryText = await generateSummary(jobId, summaryPrompt, summaryStep, localPath);
```

Replace with:
```ts
const summaryText = await summarize({
  jobId,
  step: summaryStep,
  cwd: localPath,
  prompt: summaryPrompt,
});
```

- [ ] **Step 8.5: Delete the dead helper functions**

Remove in a single edit pass:
- `buildClaudeArgs`, `codexEffortLevel`, `buildCodexArgs`, `buildQwenArgs`, `runStepWithRuntime`
- `claudeEnv` (was `export const claudeEnv = ...`)
- `formatStreamEvent`
- `generateSummary` (including the inline Claude Promise block)
- `JOB_TIMEOUT_MS` constant
- `spawnClaude`, `spawnCodex`, `spawnQwen`

**CAUTION:** `claudeEnv` was an `export`. Grep for external callers:

Run: `grep -rn "from './runner" /home/sixbox/Dev/workstream/src --include="*.ts" | grep -i "claudeEnv\|spawnClaude\|spawnCodex\|spawnQwen\|formatStreamEvent\|generateSummary"`
Expected: No matches, or matches only from test files you're about to delete.

If there are external callers other than `runner.test.ts` that use `claudeEnv`, either (a) have them import from `./runtimes/env.js` with an appropriate runtime ID, or (b) keep a thin compatibility shim for one more commit and remove in a follow-up. Document either choice in the commit message.

- [ ] **Step 8.6: Check that `buildStepPrompt` and `scanAndUploadArtifacts` still export**

The existing `runner.test.ts` imports these (see `src/server/runner.test.ts:40`: `import { scanAndUploadArtifacts, buildStepPrompt } from './runner.js'`). They must remain exported.

Run: `grep -n "^export" /home/sixbox/Dev/workstream/src/server/runner.ts`
Expected: includes `scanAndUploadArtifacts`, `buildStepPrompt`, `runFlowJob`, `cancelJob`, `cancelAllJobs`, `cleanupOrphanedJobs` (and any other existing public surface).

- [ ] **Step 8.7: Run the runner tests to verify parity**

Run: `pnpm test src/server/runner.test.ts`
Expected: PASS. These tests cover `scanAndUploadArtifacts` and `buildStepPrompt` — both untouched by this refactor.

- [ ] **Step 8.8: Run the full test suite**

Run: `pnpm test`
Expected: PASS. If anything fails, read the failure — it's likely an external caller of a deleted function that grep missed.

- [ ] **Step 8.9: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: no errors. If you see errors, they are almost certainly dead-import cleanup leftovers.

- [ ] **Step 8.10: Verify runner.ts line count dropped**

Run: `wc -l /home/sixbox/Dev/workstream/src/server/runner.ts`
Expected: approximately 750 lines (down from 1231). If it's closer to 1000, you missed a deletion — re-check step 8.5.

- [ ] **Step 8.11: Commit**

```bash
git add src/server/runner.ts
git commit -m "Wire runner to runtime driver registry and delete dead spawn code"
```

---

## Task 9: Async runtime discovery

Replaces the `execFileSync` at `ai-runtime-discovery.ts:18` with a promisified `execFile` so the first UI request doesn't stall the event loop for the duration of three `which` calls.

**Files:**
- Modify: `src/server/ai-runtime-discovery.ts`
- Modify: `src/server/ai-runtime-discovery.test.ts`
- Modify: `src/server/index.ts` (await the startup refresh)
- Modify: `src/server/worker.ts` (await any existing call)

- [ ] **Step 9.1: Find all call sites of the discovery functions**

Run: `grep -rn "refreshDetectedAiRuntimes\|getDetectedAiRuntimes\|getDetectedAiRuntime\|requireDetectedAiRuntime" /home/sixbox/Dev/workstream/src --include="*.ts"`
Expected: a list of files. Record them — you'll need to update any caller that currently uses the sync result.

- [ ] **Step 9.2: Update the test file for async API**

Edit `src/server/ai-runtime-discovery.test.ts`. Replace the existing test with:

```ts
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
```

- [ ] **Step 9.3: Run test to verify it fails**

Run: `pnpm test src/server/ai-runtime-discovery.test.ts`
Expected: FAIL — the current implementation uses `execFileSync` and the test now mocks `execFile`.

- [ ] **Step 9.4: Implement the async module**

Replace `src/server/ai-runtime-discovery.ts`:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  AI_RUNTIME_DEFINITIONS,
  type AiRuntimeId,
  type AiRuntimeStatus,
} from '../shared/ai-runtimes.js';
import { buildRuntimeEnv } from './runtimes/env.js';

const execFileAsync = promisify(execFile);

let detectedAt: string | null = null;
let cachedRuntimes: AiRuntimeStatus[] = AI_RUNTIME_DEFINITIONS.map(runtime => ({
  ...runtime,
  available: false,
  detectedPath: null,
}));

async function resolveCommandPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [command], {
      env: buildRuntimeEnv('claude_code'),
      timeout: 5_000,
    });
    const trimmed = typeof stdout === 'string' ? stdout.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

async function detectRuntimeStatuses(): Promise<AiRuntimeStatus[]> {
  const results = await Promise.all(
    AI_RUNTIME_DEFINITIONS.map(async runtime => {
      const detectedPath = await resolveCommandPath(runtime.command);
      return {
        ...runtime,
        available: Boolean(detectedPath),
        detectedPath,
      };
    }),
  );
  return results;
}

export async function refreshDetectedAiRuntimes(): Promise<AiRuntimeStatus[]> {
  cachedRuntimes = await detectRuntimeStatuses();
  detectedAt = new Date().toISOString();
  return cachedRuntimes;
}

export async function getDetectedAiRuntimes(): Promise<AiRuntimeStatus[]> {
  if (!detectedAt) return refreshDetectedAiRuntimes();
  return cachedRuntimes;
}

export function getDetectedAiRuntimeSync(): AiRuntimeStatus[] {
  return cachedRuntimes;
}

export function getDetectedAiRuntime(runtimeId: string | null | undefined): AiRuntimeStatus | null {
  if (!runtimeId) return null;
  return cachedRuntimes.find(runtime => runtime.id === runtimeId) ?? null;
}

export function requireDetectedAiRuntime(runtimeId: AiRuntimeId | string): AiRuntimeStatus {
  const runtime = getDetectedAiRuntime(runtimeId);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${runtimeId}`);
  }
  if (!runtime.available) {
    throw new Error(`Runtime not available on this server: ${runtime.label}`);
  }
  return runtime;
}

export function getDetectedAiRuntimeTimestamp(): string | null {
  return detectedAt;
}
```

Note two intentional behaviors:
1. `getDetectedAiRuntime` and `requireDetectedAiRuntime` remain **synchronous** because they're called from hot paths inside `runFlowJob` and the registry. They read from the already-populated cache.
2. A new `getDetectedAiRuntimeSync()` function is exported for the HTTP route that needs the current cache without awaiting.

- [ ] **Step 9.5: Update the HTTP route and startup refresh**

Read `src/server/routes/ai-runtimes.ts` and update if it uses `getDetectedAiRuntimes` directly — it needs to either `await` or switch to `getDetectedAiRuntimeSync()` since the cache is already populated at startup.

Read `src/server/index.ts` and find the line calling `refreshDetectedAiRuntimes()`. Wrap in `await`:

Before:
```ts
refreshDetectedAiRuntimes();
```

After:
```ts
await refreshDetectedAiRuntimes();
```

Ensure the enclosing function is `async` (startup code typically is).

Same for `src/server/worker.ts` — find the call and `await` it.

- [ ] **Step 9.6: Run all tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 9.7: Typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: no errors. The sync/async split means any caller that `await`ed the old sync function or forgot to `await` the new async one will surface here.

- [ ] **Step 9.8: Commit**

```bash
git add src/server/ai-runtime-discovery.ts src/server/ai-runtime-discovery.test.ts src/server/index.ts src/server/worker.ts src/server/routes/ai-runtimes.ts
git commit -m "Make runtime discovery async to unblock the event loop"
```

---

## Task 10: End-to-end verification

Manual and automated smoke tests to confirm the refactor didn't regress runtime execution.

**Files:** none

- [ ] **Step 10.1: Full test suite**

Run: `pnpm test`
Expected: PASS, zero failures.

- [ ] **Step 10.2: Full typecheck**

Run: `pnpm exec tsc -p tsconfig.app.json --noEmit --pretty false`
Expected: no errors.

- [ ] **Step 10.3: Build**

Run: `pnpm build`
Expected: successful build.

- [ ] **Step 10.4: Verify runner.ts size**

Run: `wc -l /home/sixbox/Dev/workstream/src/server/runner.ts /home/sixbox/Dev/workstream/src/server/runtimes/*.ts`
Expected: `runner.ts` around 750 lines; each driver file under 150 lines.

- [ ] **Step 10.5: Grep for dead references**

Run: `grep -rn "claudeEnv\|buildClaudeArgs\|buildCodexArgs\|buildQwenArgs\|spawnClaude\|spawnCodex\|spawnQwen\|formatStreamEvent\|runStepWithRuntime\|generateSummary" /home/sixbox/Dev/workstream/src --include="*.ts"`
Expected: no matches (except possibly inside deleted test blocks — if anything is left, delete it).

- [ ] **Step 10.6: Manual smoke test — Claude execution**

Start the dev server and worker:

```bash
pnpm dev
```

In the UI, create a flow with a single Claude step, attach it to a task, and run the job. Watch the worker log.

Expected:
- Job starts, Claude is spawned with `stdio: ['pipe', 'pipe', 'pipe']`.
- Stream-json events appear in the log.
- Job completes with exit 0 and a real output.

- [ ] **Step 10.7: Manual smoke test — Codex execution**

Repeat with a Codex step. Expected:
- Codex spawns with the generated `--output-last-message` path.
- JSON events appear in the log.
- Job completes with the file contents as the step output.
- Output file is deleted after the read.

- [ ] **Step 10.8: Manual smoke test — Qwen execution**

Repeat with a Qwen step. Expected:
- Qwen spawns *without* the prompt appearing in `ps -ef` output (run `ps auxf | grep qwen` while it's running).
- Job completes with trimmed stdout as the step output.

- [ ] **Step 10.9: Manual smoke test — job cancellation**

Start a long-running Claude job, then click cancel in the UI.
Expected:
- The process receives SIGTERM within 5 seconds.
- `cancelJob` rejects the driver promise with "Job canceled".
- The task returns to a cancelable state.

- [ ] **Step 10.10: Manual smoke test — env var isolation**

In a shell, set a bogus secret: `DATABASE_URL=should-not-leak pnpm dev`. Run a job with a Claude step whose prompt asks it to `echo $DATABASE_URL` via a Bash tool (or inspect the environment).
Expected: `DATABASE_URL` is **not** present in Claude's visible environment. `ANTHROPIC_API_KEY` (if set) **is** present.

- [ ] **Step 10.11: Final commit — no code, just verification log**

If any of steps 10.6–10.10 uncovered regressions, fix them in new commits and re-run. If all passed, push the branch:

```bash
git push -u origin workstream/runtime-drivers
```

Open a PR with this summary:

```
Refactor runtime execution into driver registry

Fixes:
- Environment variable leak (process.env spread → per-runtime allowlist)
- Missing timeouts on codex/qwen (shared 30-minute default via process-runner)
- Dispatch via two hardcoded switch statements (→ registry)
- Duplicated spawn plumbing across three functions (→ shared runProcess)
- Inline Claude spawn block in generateSummary (→ claudeDriver.summarize)
- Non-atomic codex temp-file read silently returning '' (→ rejects on empty)
- Qwen prompt passed via argv (ARG_MAX risk, visible in ps) (→ stdin)
- Blocking execFileSync in runtime discovery (→ async execFile)

runner.ts: 1231 → ~750 lines.
Adding a 4th runtime is now: one new file in src/server/runtimes/, one line in registry.ts.
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Env var leak (issue #1) — Task 1 creates the allowlist; Task 8 deletes `claudeEnv`.
- [x] Missing timeouts on codex/qwen (issue #2) — Task 3 puts the 30-minute default in `process-runner.ts`; drivers inherit it.
- [x] Scattered dispatch switches (issue #3) — Task 7 creates the registry; Task 8 replaces both switches.
- [x] Duplicated spawn plumbing (issue #4) — Task 3 creates `runProcess`; Tasks 4-6 each driver uses it.
- [x] Inline Claude spawn in `generateSummary` (issue #5) — Task 8 deletes `generateSummary`; Task 4's `claudeDriver.summarize` replaces it.
- [x] Non-atomic codex temp file (issue #6) — Task 5's `CodexDriver` rejects on empty output and cleans up the file.
- [x] Swallowed stdin errors in codex (issue #7) — Task 3's `runProcess` logs stdin errors consistently.
- [x] Qwen prompt via argv (issue #8) — Task 6's `QwenDriver` pipes prompt via stdin.
- [x] `execFileSync` blocks event loop — Task 9 makes discovery async.

**Placeholder scan:** No "TBD", "similar to", "implement later", or "add validation" entries. Every code step has complete code.

**Type consistency:** `RuntimeDriver`, `ExecuteStepOptions`, `SummarizeOptions` defined in Task 3 and used identically in Tasks 4-7. `buildRuntimeEnv('claude_code' | 'codex' | 'qwen_code')` used identically across drivers and discovery. `runProcess` options shape matches `RunProcessOptions` in every caller.

**Out-of-order read safety:** No task references code defined only in a later task.

---

## Follow-up plans (not in scope here)

**Phase 2 — flow extraction:** Pull `buildStepPrompt` (238 lines) into `src/server/flow/prompt-builder.ts` with per-context-source strategies. Pull `runFlowJob` (250 lines) into `src/server/flow/orchestrator.ts` split into `stepExecutor`, `retryHandler`, `gateChecker`, `jumpBackHandler`. Pull `extractVerdict`, `legacyVerifyCheck`, `legacyReviewCheck` into `src/server/flow/gate-evaluation.ts`. Target: runner.ts → ~300 lines.

**Phase 3 — jobs extraction:** Pull `scanAndUploadArtifacts` into `src/server/jobs/artifact-manager.ts`. Pull DB helpers (`updateRunningJob`, `markRunningJobForReview`, `savePhases`, `isJobStillRunning`, `cleanupOrphanedJobs`, `updateTaskStatus`) into `src/server/jobs/job-repository.ts`. Move `process-lifecycle.ts` into `src/server/jobs/` for consistency. Target: runner.ts → ~200 lines, becomes a thin coordinator.

**Frontend polish (independent):** Pipe `loading` state from `useAiRuntimes` down to `FlowStepFormFields` so the runtime dropdown is disabled during the initial fetch. Add `role="alert"` to the `runtimeCatalogError` message div. Add a test for "switching runtime resets variant to the new default".
