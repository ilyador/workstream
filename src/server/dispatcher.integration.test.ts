import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Mock state — shared across supabase mock and tests
// ---------------------------------------------------------------------------

const jobRows: Record<string, Record<string, unknown>> = {};
const taskRows: Record<string, Record<string, unknown>> = {};
const projectRows: Record<string, Record<string, unknown>> = {};
const providerConfigRows: Record<string, Record<string, unknown>> = {};
const logInserts: Array<{ job_id: string; event: string; data: unknown }> = [];

type RowRecord = Record<string, unknown>;
type QueryResult = { data: RowRecord[]; error: null };
type QuerySingleResult = { data: RowRecord | null; error: null };
type PromiseResolver<T> = ((value: T) => unknown) | null | undefined;
type PromiseRejector = ((reason: unknown) => unknown) | null | undefined;

interface UpdateChain extends PromiseLike<QueryResult> {
  eq: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: PromiseResolver<QueryResult | TResult1>,
    onrejected?: PromiseRejector,
  ): PromiseLike<TResult1 | TResult2>;
}

interface TableChain extends PromiseLike<QueryResult> {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: PromiseResolver<QueryResult | TResult1>,
    onrejected?: PromiseRejector,
  ): PromiseLike<TResult1 | TResult2>;
}

type FakeStdin = EventEmitter & {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

type FakeChildProcess = ChildProcess & EventEmitter & {
  stdin: FakeStdin;
  stdout: EventEmitter;
  stderr: EventEmitter;
  pid: number;
  kill: ReturnType<typeof vi.fn>;
};

function asRecord(value: unknown): RowRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RowRecord : {};
}

function resetState() {
  for (const k of Object.keys(jobRows)) delete jobRows[k];
  for (const k of Object.keys(taskRows)) delete taskRows[k];
  for (const k of Object.keys(projectRows)) delete projectRows[k];
  for (const k of Object.keys(providerConfigRows)) delete providerConfigRows[k];
  logInserts.length = 0;
}

// ---------------------------------------------------------------------------
// Mock supabase — in-memory job/task store
// ---------------------------------------------------------------------------

function makeChain(table: string) {
  const filters: Record<string, unknown> = {};
  let orderBy: { col: string; ascending: boolean } | null = null;

  const rowsForTable = () => {
    if (table === 'jobs') return Object.values(jobRows);
    if (table === 'tasks') return Object.values(taskRows);
    if (table === 'projects') return Object.values(projectRows);
    if (table === 'provider_configs') return Object.values(providerConfigRows);
    return [];
  };

  const filteredRows = () => {
    const rows = rowsForTable().filter(row => (
      Object.entries(filters).every(([key, value]) => row[key] === value)
    ));
    if (orderBy) {
      rows.sort((a, b) => {
        const left = String(a[orderBy!.col] ?? '');
        const right = String(b[orderBy!.col] ?? '');
        return orderBy!.ascending ? left.localeCompare(right) : right.localeCompare(left);
      });
    }
    return rows;
  };

  const chain = {} as TableChain;
  Object.assign(chain, {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
      orderBy = { col, ascending: opts?.ascending !== false };
      return chain;
    }),
    single: vi.fn(async (): Promise<QuerySingleResult> => ({ data: filteredRows()[0] ?? null, error: null })),
    maybeSingle: vi.fn(async (): Promise<QuerySingleResult> => ({ data: filteredRows()[0] ?? null, error: null })),
    update: vi.fn((payload: Record<string, unknown>) => {
      const innerChain = {} as UpdateChain;
      Object.assign(innerChain, {
        eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return innerChain; }),
        select: vi.fn(() => innerChain),
      });
      // Make it thenable so `await` works on both `update(...).eq(...)` and `update(...).eq(...).select(...)`
      const resolve = async (): Promise<QueryResult> => {
        const rows = filteredRows();
        if (rows.length === 0) return { data: [], error: null };
        const updatedIds: Array<{ id: unknown }> = [];
        for (const row of rows) {
          if (filters['status'] && row.status !== filters['status']) continue;
          Object.assign(row, payload);
          updatedIds.push({ id: row.id });
        }
        return { data: updatedIds, error: null };
      };
      innerChain.then = (onfulfilled, onrejected) => resolve().then(onfulfilled, onrejected);
      return innerChain;
    }),
    insert: vi.fn(async (rows: unknown) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      logInserts.push(...arr);
      if (table === 'provider_configs') {
        for (const row of arr) {
          const record = asRecord(row);
          const id = `${record.project_id}:${record.provider}`;
          providerConfigRows[id] = { id, ...record };
        }
      }
      return { data: arr, error: null };
    }),
    upsert: vi.fn(async (row: unknown) => {
      return { data: row, error: null };
    }),
    then: (onfulfilled, onrejected) => Promise.resolve({ data: filteredRows(), error: null }).then(onfulfilled, onrejected),
  });
  return chain;
}

vi.mock('./supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => makeChain(table)),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
      })),
    },
  },
}));

// ---------------------------------------------------------------------------
// Mock child_process.spawn — return controllable fake processes
// ---------------------------------------------------------------------------

let spawnBehavior: 'succeed' | 'fail' | 'gate-pass' | 'gate-fail' | 'hang' | 'question' | 'canceled' = 'succeed';
let spawnDelay = 0;

function makeFakeProcess(): ChildProcess {
  const proc = new EventEmitter() as unknown as FakeChildProcess;
  const stdin = new EventEmitter() as FakeStdin;
  stdin.write = vi.fn();
  stdin.end = vi.fn();
  proc.stdin = stdin;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = Math.floor(Math.random() * 10000);
  proc.kill = vi.fn(() => {
    setTimeout(() => proc.emit('close', null, 'SIGTERM'), 10);
    return true;
  });

  // Schedule output based on behavior
  setTimeout(() => {
    if (spawnBehavior === 'succeed' || spawnBehavior === 'gate-pass') {
      // Gate-pass includes a verdict block in the output
      let text = 'Did the work.\n[summary] Completed the step\n';
      if (spawnBehavior === 'gate-pass') {
        text = '```json\n{"passed": true, "reason": "All checks pass"}\n```\n[summary] Gate passed\n';
      }
      const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      proc.stdout.emit('data', Buffer.from(event + '\n'));
      const result = JSON.stringify({ type: 'result', duration_ms: 1000 });
      proc.stdout.emit('data', Buffer.from(result + '\n'));
      proc.emit('close', 0, null);
    } else if (spawnBehavior === 'gate-fail') {
      const text = '```json\n{"passed": false, "reason": "Tests are failing"}\n```\n[summary] Gate failed\n';
      const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      proc.stdout.emit('data', Buffer.from(event + '\n'));
      const result = JSON.stringify({ type: 'result', duration_ms: 1000 });
      proc.stdout.emit('data', Buffer.from(result + '\n'));
      proc.emit('close', 0, null);
    } else if (spawnBehavior === 'fail') {
      proc.stderr.emit('data', Buffer.from('Something went wrong\n'));
      proc.emit('close', 1, null);
    } else if (spawnBehavior === 'question') {
      const text = 'Should I proceed with the changes?\n[summary] Asked a question\n';
      const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      proc.stdout.emit('data', Buffer.from(event + '\n'));
      const result = JSON.stringify({ type: 'result', duration_ms: 500 });
      proc.stdout.emit('data', Buffer.from(result + '\n'));
      proc.emit('close', 0, null);
    } else if (spawnBehavior === 'hang') {
      // Don't emit close — process hangs
    }
    // 'canceled' — the test will call cancelJob which kills it
  }, spawnDelay);

  return proc;
}

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => makeFakeProcess()),
  };
});

// Mock modules that runner imports
vi.mock('./routes/data.js', () => ({
  discoverSkills: vi.fn().mockReturnValue([]),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runFlowJob } from './runner.js';
import type { FlowJobContext, FlowConfig, FlowStepConfig } from './runner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<FlowStepConfig> = {}): FlowStepConfig {
  return {
    position: 1,
    name: 'implement',
    instructions: 'Do the work.',
    model: 'opus',
    tools: [],
    context_sources: ['task_description'],
    is_gate: false,
    on_fail_jump_to: null,
    max_retries: 0,
    on_max_retries: 'pause',
    ...overrides,
  };
}

function makeFlow(overrides: Partial<FlowConfig> = {}): FlowConfig {
  return {
    flow_name: 'Test Flow',
    agents_md: null,
    provider_binding: 'task_selected',
    steps: [makeStep()],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<FlowJobContext> = {}): FlowJobContext {
  return {
    jobId: 'job-001',
    taskId: 'task-001',
    projectId: 'proj-001',
    localPath: '/tmp/fake-project',
    task: {
      id: 'task-001',
      title: 'Test task',
      description: 'A test task',
      chaining: 'none',
      multiagent: 'auto',
      images: [],
    },
    flow: makeFlow(),
    phasesAlreadyCompleted: [],
    onLog: vi.fn(),
    onPhaseStart: vi.fn(),
    onPhaseComplete: vi.fn(),
    onPause: vi.fn(),
    onReview: vi.fn(),
    onDone: vi.fn(),
    onFail: vi.fn(),
    ...overrides,
  };
}

function seedJob(id: string, status = 'running') {
  jobRows[id] = { id, status, task_id: 'task-001', started_at: new Date().toISOString() };
}

function seedTask(id: string, status = 'in_progress') {
  taskRows[id] = { id, status };
}

function seedProject(id: string) {
  projectRows[id] = { id, embedding_provider_config_id: null, embedding_dimensions: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatcher integration', () => {
  beforeEach(async () => {
    resetState();
    seedProject('proj-001');
    spawnBehavior = 'succeed';
    spawnDelay = 0;
    vi.clearAllMocks();
    // Re-establish spawn mock (may have been overridden by individual tests)
    const cp = await import('child_process');
    vi.mocked(cp.spawn).mockImplementation(() => makeFakeProcess());
  });

  // -------------------------------------------------------------------------
  // C5: updateTaskStatus retries on error
  // -------------------------------------------------------------------------
  describe('task status updates with retry (C5)', () => {
    it('calls onFail and updates task status on terminal gate failure', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'gate-fail';

      const onFail = vi.fn();
      const ctx = makeCtx({
        flow: makeFlow({
          steps: [makeStep({ is_gate: true, max_retries: 0, on_max_retries: 'fail' })],
        }),
        onFail,
      });

      await runFlowJob(ctx);

      expect(onFail).toHaveBeenCalled();
      expect(taskRows['task-001'].status).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // C5 + race: terminal write on canceled job skips callbacks
  // -------------------------------------------------------------------------
  describe('canceled job skips terminal callbacks (fix #3/#4)', () => {
    it('returns early without calling onFail when job is canceled', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'gate-fail';

      const onFail = vi.fn();
      const ctx = makeCtx({
        flow: makeFlow({
          steps: [makeStep({ is_gate: true, max_retries: 0, on_max_retries: 'fail' })],
        }),
        onFail,
      });

      // Simulate cancellation: set job status to 'canceling' before runner writes terminal state
      jobRows['job-001'].status = 'canceling';

      await runFlowJob(ctx);

      // onFail should NOT be called because job was canceled
      expect(onFail).not.toHaveBeenCalled();
      // Task status should remain unchanged (cancel flow handles it)
      expect(taskRows['task-001'].status).toBe('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // Normal flow: successful single-step job
  // -------------------------------------------------------------------------
  describe('successful single-step job', () => {
    it('completes and calls onReview + onDone', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'succeed';

      const onReview = vi.fn();
      const onDone = vi.fn();
      const ctx = makeCtx({ onReview, onDone });

      await runFlowJob(ctx);

      expect(jobRows['job-001'].status).toBe('review');
      expect(taskRows['task-001'].status).toBe('review');
      expect(onReview).toHaveBeenCalled();
      expect(onDone).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // H3: Jump cycle detection
  // -------------------------------------------------------------------------
  describe('jump cycle detection (H3)', () => {
    it('aborts after MAX_TOTAL_JUMPS to prevent infinite loops', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');

      // stepA (not a gate) always succeeds, stepB (gate) always fails and jumps back to stepA
      // This creates: A→ok, B→fail→jump A, A→ok, B→fail→jump A, ... until cycle cap
      let spawnCount = 0;
      const { spawn } = await import('child_process');
      vi.mocked(spawn).mockImplementation((() => {
        spawnCount++;
        // All spawns succeed with output, but gate steps get a fail verdict
        const proc = new EventEmitter() as unknown as FakeChildProcess;
        const stdin = new EventEmitter() as FakeStdin;
        stdin.write = vi.fn();
        stdin.end = vi.fn();
        proc.stdin = stdin;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.pid = spawnCount;
        proc.kill = vi.fn(() => { setTimeout(() => proc.emit('close', null, 'SIGTERM'), 5); return true; });
        setTimeout(() => {
          // Gate-fail verdict for all — non-gate steps ignore the verdict anyway
          const text = '```json\n{"passed": false, "reason": "Tests failing"}\n```\n[summary] Step done\n';
          const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
          proc.stdout.emit('data', Buffer.from(event + '\n'));
          const result = JSON.stringify({ type: 'result', duration_ms: 100 });
          proc.stdout.emit('data', Buffer.from(result + '\n'));
          proc.emit('close', 0, null);
        }, 1);
        return proc;
      }));

      const onFail = vi.fn();
      const stepA = makeStep({
        position: 1,
        name: 'stepA',
        is_gate: false, // Not a gate — always passes through
      });
      const stepB = makeStep({
        position: 2,
        name: 'stepB',
        is_gate: true,
        max_retries: 200, // High limit so cycle detection fires before per-step limit
        on_max_retries: 'fail',
        on_fail_jump_to: 1, // Jump back to stepA
      });

      const ctx = makeCtx({
        flow: makeFlow({ steps: [stepA, stepB] }),
        onFail,
      });

      await runFlowJob(ctx);

      expect(onFail).toHaveBeenCalled();
      const failMsg = onFail.mock.calls[0][0];
      expect(failMsg).toContain('exceeded');
      expect(failMsg).toContain('50');
      expect(jobRows['job-001'].status).toBe('failed');
    }, 30000);
  });

  // -------------------------------------------------------------------------
  // H5: _gateFeedback cleared after gate passes
  // -------------------------------------------------------------------------
  describe('gate feedback cleanup (H5)', () => {
    it('clears _gateFeedback after a gate step passes', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'gate-pass';

      const task = {
        id: 'task-001',
        title: 'Test',
        description: 'Test',
        chaining: 'none',
        multiagent: 'auto',
        images: [],
        _gateFeedback: 'Stale feedback from previous failure',
      };

      const ctx = makeCtx({
        task,
        flow: makeFlow({
          steps: [makeStep({ is_gate: true })],
        }),
      });

      await runFlowJob(ctx);

      // _gateFeedback should be cleared because the gate step passed
      expect(task._gateFeedback).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // agents_md always injected
  // -------------------------------------------------------------------------
  describe('agents_md always injected (fix #1)', () => {
    it('injects agents_md for every step in the flow', async () => {
      // This is already tested in runner.test.ts but verify it still holds
      const { buildStepPrompt } = await import('./runner.js');
      const step = makeStep();
      const flow = makeFlow({ agents_md: 'Always apply these rules.' });
      const task = { id: 't1', title: 'T', description: 'D', chaining: 'none', multiagent: 'auto', images: [] };

      const prompt = await buildStepPrompt(step, flow, task, [], '/tmp/fake');
      expect(prompt).toContain('Always apply these rules.');
    });
  });

  // -------------------------------------------------------------------------
  // Pause on question
  // -------------------------------------------------------------------------
  describe('pause on question detection', () => {
    it('pauses job and task when Claude asks a question', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'question';

      const onPause = vi.fn();
      const ctx = makeCtx({ onPause });

      await runFlowJob(ctx);

      expect(onPause).toHaveBeenCalled();
      expect(jobRows['job-001'].status).toBe('paused');
      expect(taskRows['task-001'].status).toBe('paused');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-step flow completes all steps
  // -------------------------------------------------------------------------
  describe('multi-step flow', () => {
    it('runs all steps in sequence and reaches review', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'succeed';

      const onPhaseComplete = vi.fn();
      const onReview = vi.fn();
      const ctx = makeCtx({
        flow: makeFlow({
          steps: [
            makeStep({ position: 1, name: 'plan' }),
            makeStep({ position: 2, name: 'implement' }),
            makeStep({ position: 3, name: 'review', is_gate: true }),
          ],
        }),
        onPhaseComplete,
        onReview,
      });

      await runFlowJob(ctx);

      // All 3 steps should complete (plus summary call)
      expect(onPhaseComplete).toHaveBeenCalledTimes(3);
      expect(onReview).toHaveBeenCalled();
      expect(jobRows['job-001'].status).toBe('review');
    });
  });

  // -------------------------------------------------------------------------
  // Resume from pause with completed phases
  // -------------------------------------------------------------------------
  describe('resume from pause', () => {
    it('skips already-completed phases on resume', async () => {
      seedJob('job-001', 'running');
      seedTask('task-001', 'in_progress');
      spawnBehavior = 'succeed';

      const onPhaseStart = vi.fn();
      const ctx = makeCtx({
        flow: makeFlow({
          steps: [
            makeStep({ position: 1, name: 'plan' }),
            makeStep({ position: 2, name: 'implement' }),
          ],
        }),
        phasesAlreadyCompleted: [{ phase: 'plan', output: 'Already done', summary: 'Done' }],
        onPhaseStart,
      });

      await runFlowJob(ctx);

      // Should only start 'implement', not 'plan'
      const startedPhases = onPhaseStart.mock.calls.map(c => c[0]);
      expect(startedPhases).not.toContain('plan');
      expect(startedPhases).toContain('implement');
    });
  });
});
