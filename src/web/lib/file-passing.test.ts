import { describe, expect, it } from 'vitest';
import {
  buildTaskFileDependency,
  getTaskFileGate,
  hasFileAwaitingApproval,
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
});
