import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Mock state — shared across supabase mock and tests
// ---------------------------------------------------------------------------

const jobRows: Record<string, Record<string, unknown>> = {};
const taskRows: Record<string, Record<string, unknown>> = {};
const logInserts: Array<{ job_id: string; event: string; data: any }> = [];

function resetState() {
  for (const k of Object.keys(jobRows)) delete jobRows[k];
  for (const k of Object.keys(taskRows)) delete taskRows[k];
  logInserts.length = 0;
}

// ---------------------------------------------------------------------------
// Mock supabase — in-memory job/task store
// ---------------------------------------------------------------------------

function makeChain(table: string) {
  let filters: Record<string, unknown> = {};
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return chain; }),
    single: vi.fn(async () => {
      const store = table === 'jobs' ? jobRows : table === 'tasks' ? taskRows : {};
      const id = filters['id'] as string;
      return { data: store[id] ?? null, error: null };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      const innerChain: any = {
        eq: vi.fn((col: string, val: unknown) => { filters[col] = val; return innerChain; }),
        select: vi.fn(() => innerChain),
        then: undefined as any,
      };
      // Make it thenable so `await` works on both `update(...).eq(...)` and `update(...).eq(...).select(...)`
      const resolve = async () => {
        const store = table === 'jobs' ? jobRows : table === 'tasks' ? taskRows : {};
        const id = filters['id'] as string;
        const row = store[id];
        if (!row) return { data: [], error: null };
        // Check status filter (used by updateRunningJob)
        if (filters['status'] && row.status !== filters['status']) {
          return { data: [], error: null };
        }
        Object.assign(row, payload);
        return { data: [{ id }], error: null };
      };
      innerChain.then = (fn: any, rej?: any) => resolve().then(fn, rej);
      return innerChain;
    }),
    insert: vi.fn(async (rows: any) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      logInserts.push(...arr);
      return { data: arr, error: null };
    }),
    upsert: vi.fn(async (row: any) => {
      return { data: row, error: null };
    }),
  };
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
  const proc = new EventEmitter() as any;
  const stdin = new EventEmitter() as any;
  stdin.write = vi.fn();
  stdin.end = vi.fn();
  proc.stdin = stdin;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.pid = Math.floor(Math.random() * 10000);
  proc.kill = vi.fn(() => {
    setTimeout(() => proc.emit('close', null), 10);
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
      proc.emit('close', 0);
    } else if (spawnBehavior === 'gate-fail') {
      const text = '```json\n{"passed": false, "reason": "Tests are failing"}\n```\n[summary] Gate failed\n';
      const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      proc.stdout.emit('data', Buffer.from(event + '\n'));
      const result = JSON.stringify({ type: 'result', duration_ms: 1000 });
      proc.stdout.emit('data', Buffer.from(result + '\n'));
      proc.emit('close', 0);
    } else if (spawnBehavior === 'fail') {
      proc.stderr.emit('data', Buffer.from('Something went wrong\n'));
      proc.emit('close', 1);
    } else if (spawnBehavior === 'question') {
      const text = 'Should I proceed with the changes?\n[summary] Asked a question\n';
      const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      proc.stdout.emit('data', Buffer.from(event + '\n'));
      const result = JSON.stringify({ type: 'result', duration_ms: 500 });
      proc.stdout.emit('data', Buffer.from(result + '\n'));
      proc.emit('close', 0);
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

// Mock ai-runtime-discovery so requireDetectedAiRuntime works without a live cache
vi.mock('./ai-runtime-discovery.js', () => ({
  requireDetectedAiRuntime: vi.fn((id: string) => ({ id, available: true, label: id, command: id })),
  getDetectedAiRuntime: vi.fn((id: string | null | undefined) =>
    id ? { id, available: true, label: id, command: id } : null,
  ),
  getDetectedAiRuntimes: vi.fn(async () => []),
  getDetectedAiRuntimesSync: vi.fn(() => []),
  refreshDetectedAiRuntimes: vi.fn(async () => []),
  getDetectedAiRuntimeTimestamp: vi.fn(() => null),
}));

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
    runtime_kind: 'coding',
    runtime_id: 'claude_code',
    runtime_variant: 'opus',
    tools: [],
    context_sources: ['task_description'],
    use_project_data: false,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatcher integration', () => {
  beforeEach(async () => {
    resetState();
    spawnBehavior = 'succeed';
    spawnDelay = 0;
    vi.clearAllMocks();
    // Re-establish spawn mock (may have been overridden by individual tests)
    const cp = await import('child_process');
    vi.mocked(cp.spawn).mockImplementation((() => makeFakeProcess()) as any);
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
        const proc = new EventEmitter() as any;
        const stdin = new EventEmitter() as any;
        stdin.write = vi.fn();
        stdin.end = vi.fn();
        proc.stdin = stdin;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.pid = spawnCount;
        proc.kill = vi.fn(() => { setTimeout(() => proc.emit('close', null), 5); return true; });
        setTimeout(() => {
          // Gate-fail verdict for all — non-gate steps ignore the verdict anyway
          const text = '```json\n{"passed": false, "reason": "Tests failing"}\n```\n[summary] Step done\n';
          const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
          proc.stdout.emit('data', Buffer.from(event + '\n'));
          const result = JSON.stringify({ type: 'result', duration_ms: 100 });
          proc.stdout.emit('data', Buffer.from(result + '\n'));
          proc.emit('close', 0);
        }, 1);
        return proc;
      }) as any);

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
    it('injects agents_md regardless of step context sources', async () => {
      // This is already tested in runner.test.ts but verify it still holds
      const { buildStepPrompt } = await import('./runner.js');
      const step = makeStep({ context_sources: ['task_description'] });
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
