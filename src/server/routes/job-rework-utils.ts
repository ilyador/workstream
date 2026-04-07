import { asRecord, stringField } from '../authz.js';
import { supabase } from '../supabase.js';

export async function cleanupQueuedReworkJob(newJob: unknown): Promise<void> {
  const newJobRecord = asRecord(newJob);
  const newJobId = newJobRecord ? stringField(newJobRecord, 'id') : null;
  if (!newJobId) return;
  const { error } = await supabase.from('jobs').delete().eq('id', newJobId);
  if (error) console.error(`[rework] Failed to clean up queued rework job ${newJobId}:`, error.message);
}
