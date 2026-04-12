import { describe, expect, it } from 'vitest';
import {
  buildTaskFileDependency,
  getTaskFileGate,
  hasFileAwaitingApproval,
  isTaskApprovedForFilePassing,
  taskAcceptsFiles,
  taskProducesFiles,
  type ArtifactSnapshot,
} from './file-passing';
import type { TaskView } from './task-view';

const loadedEmpty: ArtifactSnapshot = { count: 0, loaded: true, error: null };
const loadedWithFile: ArtifactSnapshot = { count: 1, loaded: true, error: null };

function makeTask(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1',
    title: 'Task',
    type: 'feature',
    mode: 'ai',
    effort: 'medium',
    auto_continue: true,
    status: 'backlog',
    chaining: 'none',
    ...overrides,
  };
}

describe('file passing gates', () => {
  it('blocks accepting tasks until the producing task is approved even when a file exists', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'accept' }),
      dependency: buildTaskFileDependency(makeTask({ id: 'producer', status: 'review' }), 'review'),
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedWithFile,
    });

    expect(gate).toMatchObject({
      blocked: true,
      checking: false,
      reason: 'previous-task-pending',
      message: 'Awaiting previous task approval',
    });
  });

  it('waits for previous artifacts only after the producer is approved', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'accept' }),
      dependency: buildTaskFileDependency(makeTask({ id: 'producer', status: 'done' }), null),
      ownArtifacts: loadedEmpty,
      previousArtifacts: { count: 0, loaded: false, error: null },
    });

    expect(gate).toMatchObject({
      blocked: true,
      checking: true,
      reason: 'previous-file-loading',
    });
  });

  it('prioritizes upstream approval over the accepting task output requirement', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'both' }),
      dependency: buildTaskFileDependency(makeTask({ id: 'producer', status: 'review' }), 'review'),
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedWithFile,
    });

    expect(gate.reason).toBe('previous-task-pending');
    expect(gate.message).toBe('Awaiting previous task approval');
  });

  it('marks produced files in review as awaiting approval', () => {
    expect(hasFileAwaitingApproval({
      task: makeTask({ chaining: 'produce' }),
      jobStatus: 'review',
      ownArtifacts: loadedWithFile,
    })).toBe(true);
  });

  // --- output gate coverage (producing tasks) ---------------------------

  it('blocks producing tasks until an output file is attached', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'produce' }),
      dependency: null,
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedEmpty,
    });
    expect(gate).toMatchObject({
      blocked: true,
      checking: false,
      reason: 'output-file-missing',
      message: 'Attach a file before completing',
    });
  });

  it('reports checking state while the output artifact snapshot is still loading', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'produce' }),
      dependency: null,
      ownArtifacts: { count: 0, loaded: false, error: null },
      previousArtifacts: loadedEmpty,
    });
    expect(gate).toMatchObject({
      blocked: true,
      checking: true,
      reason: 'output-file-loading',
    });
  });

  it('surfaces output-file-check-failed when the snapshot returns an error', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'produce' }),
      dependency: null,
      ownArtifacts: { count: 0, loaded: true, error: 'permission denied' },
      previousArtifacts: loadedEmpty,
    });
    expect(gate).toMatchObject({
      blocked: true,
      checking: false,
      reason: 'output-file-check-failed',
    });
  });

  it('clears the gate for producing tasks once an output file is loaded', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'produce' }),
      dependency: null,
      ownArtifacts: loadedWithFile,
      previousArtifacts: loadedEmpty,
    });
    expect(gate).toEqual({ reason: null, blocked: false, checking: false, message: '' });
  });

  // --- "both" chaining needs input AND output --------------------------

  it('blocks both-chained tasks on output after the input gate passes', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'both' }),
      dependency: buildTaskFileDependency(makeTask({ id: 'producer', status: 'done' }), 'done'),
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedWithFile,
    });
    expect(gate.reason).toBe('output-file-missing');
  });

  // --- missing-previous-task branch on accept --------------------------

  it('blocks accepting tasks when there is no previous task at all', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'accept' }),
      dependency: null,
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedEmpty,
    });
    expect(gate.reason).toBe('missing-previous-task');
  });

  it('surfaces previous-file-check-failed when the upstream snapshot errored', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'accept' }),
      dependency: buildTaskFileDependency(makeTask({ id: 'producer', status: 'done' }), 'done'),
      ownArtifacts: loadedEmpty,
      previousArtifacts: { count: 0, loaded: true, error: 'network' },
    });
    expect(gate.reason).toBe('previous-file-check-failed');
  });

  it('does not gate none-chained tasks at all', () => {
    const gate = getTaskFileGate({
      task: makeTask({ chaining: 'none' }),
      dependency: null,
      ownArtifacts: loadedEmpty,
      previousArtifacts: loadedEmpty,
    });
    expect(gate).toEqual({ reason: null, blocked: false, checking: false, message: '' });
  });

  // --- hasFileAwaitingApproval negative cases --------------------------

  it('does not report file awaiting approval when the job is not in review', () => {
    for (const jobStatus of ['queued', 'running', 'paused', 'done', 'failed', null] as const) {
      expect(hasFileAwaitingApproval({
        task: makeTask({ chaining: 'produce' }),
        jobStatus,
        ownArtifacts: loadedWithFile,
      })).toBe(false);
    }
  });

  it('does not report file awaiting approval for non-producing chaining', () => {
    for (const chaining of ['none', 'accept'] as const) {
      expect(hasFileAwaitingApproval({
        task: makeTask({ chaining }),
        jobStatus: 'review',
        ownArtifacts: loadedWithFile,
      })).toBe(false);
    }
  });

  it('does not report file awaiting approval when artifacts are still loading', () => {
    expect(hasFileAwaitingApproval({
      task: makeTask({ chaining: 'produce' }),
      jobStatus: 'review',
      ownArtifacts: { count: 1, loaded: false, error: null },
    })).toBe(false);
  });

  it('does not report file awaiting approval when there are zero artifacts', () => {
    expect(hasFileAwaitingApproval({
      task: makeTask({ chaining: 'produce' }),
      jobStatus: 'review',
      ownArtifacts: loadedEmpty,
    })).toBe(false);
  });

  // --- direct helper coverage -------------------------------------------

  it('taskAcceptsFiles recognizes accept and both chaining', () => {
    expect(taskAcceptsFiles({ chaining: 'accept' })).toBe(true);
    expect(taskAcceptsFiles({ chaining: 'both' })).toBe(true);
    expect(taskAcceptsFiles({ chaining: 'produce' })).toBe(false);
    expect(taskAcceptsFiles({ chaining: 'none' })).toBe(false);
  });

  it('taskProducesFiles recognizes produce and both chaining', () => {
    expect(taskProducesFiles({ chaining: 'produce' })).toBe(true);
    expect(taskProducesFiles({ chaining: 'both' })).toBe(true);
    expect(taskProducesFiles({ chaining: 'accept' })).toBe(false);
    expect(taskProducesFiles({ chaining: 'none' })).toBe(false);
  });

  it('isTaskApprovedForFilePassing treats task.status=done and jobStatus=done as equivalent', () => {
    // Manual approval path: task record was explicitly marked done by a user
    expect(isTaskApprovedForFilePassing({ status: 'done' }, null)).toBe(true);
    expect(isTaskApprovedForFilePassing({ status: 'done' }, 'running')).toBe(true);
    // Auto-approval path: job finished and took the task along with it
    expect(isTaskApprovedForFilePassing({ status: 'review' }, 'done')).toBe(true);
    // Neither approved
    expect(isTaskApprovedForFilePassing({ status: 'review' }, 'review')).toBe(false);
    expect(isTaskApprovedForFilePassing({ status: 'backlog' }, null)).toBe(false);
    // Null/undefined input is defensively false
    expect(isTaskApprovedForFilePassing(null, null)).toBe(false);
    expect(isTaskApprovedForFilePassing(undefined, 'done')).toBe(true);
  });

  it('buildTaskFileDependency nulls previousJobStatus when there is no previous task', () => {
    expect(buildTaskFileDependency(null, 'done')).toEqual({ previousTask: null, previousJobStatus: null });
    expect(buildTaskFileDependency(undefined, 'done')).toEqual({ previousTask: null, previousJobStatus: null });
    const producer = makeTask({ id: 'producer', status: 'done' });
    expect(buildTaskFileDependency(producer, 'done')).toEqual({ previousTask: producer, previousJobStatus: 'done' });
    expect(buildTaskFileDependency(producer, undefined)).toEqual({ previousTask: producer, previousJobStatus: null });
  });
});
