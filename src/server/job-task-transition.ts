import { supabase } from './supabase.js';

/**
 * Atomically update job and task status in a single Postgres transaction.
 * Returns the updated job data, or null if the guard failed (job not in expected status).
 */
export async function transitionJobAndTask(params: {
  jobId: string;
  expectedStatus: string | null;
  jobUpdates: Record<string, unknown>;
  taskId?: string;
  taskUpdates?: Record<string, unknown>;
}): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc('transition_job_and_task', {
    p_job_id: params.jobId,
    p_expected_status: params.expectedStatus,
    p_job_updates: params.jobUpdates,
    p_task_id: params.taskId ?? null,
    p_task_updates: params.taskUpdates ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as Record<string, unknown> | null, error: null };
}
