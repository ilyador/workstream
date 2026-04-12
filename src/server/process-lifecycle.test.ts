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
  beforeEach(async () => {
    await cancelAllJobs();
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

  it('cancelAllJobs kills processes across all jobs and awaits termination', async () => {
    const a = new MockProc();
    const b = new MockProc();
    registerActiveProcess('job-1', a as unknown as ChildProcess);
    registerActiveProcess('job-2', b as unknown as ChildProcess);
    await cancelAllJobs();
    expect(a.killCalls.length).toBeGreaterThan(0);
    expect(b.killCalls.length).toBeGreaterThan(0);
    // Cancellation flags are cleared after termination, so a re-queued
    // job id won't be reported as canceled.
    expect(isJobCanceled('job-1')).toBe(false);
    expect(isJobCanceled('job-2')).toBe(false);
    expect(getActiveProcessCount('job-1')).toBe(0);
    expect(getActiveProcessCount('job-2')).toBe(0);
  });

  it('cancelAllJobs marks jobs canceled while processes are still closing', async () => {
    // Use a stubborn proc whose close() only fires when we tell it to, so
    // we can observe the flag state in the middle of termination.
    const stubborn = new MockProc();
    stubborn.kill = function(signal?: string) {
      this.killCalls.push(signal ?? 'SIGTERM');
      return true;
    };
    registerActiveProcess('job-x', stubborn as unknown as ChildProcess);
    const all = cancelAllJobs();
    // At this point the flag must be set so any in-flight close handler
    // sees the job as canceled, not a normal exit.
    expect(isJobCanceled('job-x')).toBe(true);
    stubborn.emit('close', 0);
    await all;
    expect(isJobCanceled('job-x')).toBe(false);
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
