import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

/** Check if a workstream already has an active job. */
export async function hasActiveWorkstreamJob(workstreamId: string, statuses = ['queued', 'running', 'paused', 'review']): Promise<string | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('id, tasks!inner(workstream_id)')
    .eq('tasks.workstream_id', workstreamId)
    .in('status', statuses)
    .limit(1);
  if (error) throw new Error(`Failed to check active workstream jobs: ${error.message}`);
  return data && data.length > 0 ? data[0].id : null;
}

/** Save phases_completed with one retry on failure. */
export async function savePhases(jobId: string, phasesCompleted: unknown[]): Promise<void> {
  let { error } = await supabase.from('jobs').update({ phases_completed: phasesCompleted }).eq('id', jobId);
  if (error) {
    console.error(`[runner] Failed to save phases_completed for job ${jobId}, retrying:`, error.message);
    ({ error } = await supabase.from('jobs').update({ phases_completed: phasesCompleted }).eq('id', jobId));
    if (error) console.error(`[runner] Retry also failed for job ${jobId}:`, error.message);
  }
}
