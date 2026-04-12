import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('./supabase.js', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

describe('transitionJobAndTask', () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('calls the transition_job_and_task RPC with the correct parameters', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'job-1', status: 'queued' }, error: null });

    const { transitionJobAndTask } = await import('./job-task-transition.js');
    const result = await transitionJobAndTask({
      jobId: 'job-1',
      expectedStatus: 'paused',
      jobUpdates: { status: 'queued', answer: 'yes' },
      taskId: 'task-1',
      taskUpdates: { status: 'in_progress' },
    });

    expect(rpcMock).toHaveBeenCalledWith('transition_job_and_task', {
      p_job_id: 'job-1',
      p_expected_status: 'paused',
      p_job_updates: { status: 'queued', answer: 'yes' },
      p_task_id: 'task-1',
      p_task_updates: { status: 'in_progress' },
    });
    expect(result).toEqual({ data: { id: 'job-1', status: 'queued' }, error: null });
  });

  it('defaults taskId and taskUpdates to null when omitted', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'job-1' }, error: null });

    const { transitionJobAndTask } = await import('./job-task-transition.js');
    await transitionJobAndTask({
      jobId: 'job-1',
      expectedStatus: null,
      jobUpdates: { status: 'running' },
    });

    expect(rpcMock).toHaveBeenCalledWith('transition_job_and_task', {
      p_job_id: 'job-1',
      p_expected_status: null,
      p_job_updates: { status: 'running' },
      p_task_id: null,
      p_task_updates: null,
    });
  });

  it('returns data: null when the RPC returns null (guard failed)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { transitionJobAndTask } = await import('./job-task-transition.js');
    const result = await transitionJobAndTask({
      jobId: 'job-1',
      expectedStatus: 'paused',
      jobUpdates: { status: 'queued' },
    });

    expect(result).toEqual({ data: null, error: null });
  });

  it('returns a generic error and logs the detail on RPC failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      rpcMock.mockResolvedValue({ data: null, error: { message: 'relation "jobs" does not exist' } });

      const { transitionJobAndTask } = await import('./job-task-transition.js');
      const result = await transitionJobAndTask({
        jobId: 'job-1',
        expectedStatus: 'paused',
        jobUpdates: { status: 'queued' },
      });

      expect(result.data).toBeNull();
      expect(result.error).toBe('Failed to update job status');
      expect(result.error).not.toContain('relation');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('RPC failed for job job-1'),
        expect.stringContaining('relation'),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
