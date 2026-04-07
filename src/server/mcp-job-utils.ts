import { asRecord, isMissingRowError, stringField } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError } from './mcp-authz.js';
import { supabase } from './supabase.js';

type McpJobRow = {
  project_id: string;
  task_id?: string | null;
  status?: string | null;
  answer?: string | null;
};

export async function loadScopedMcpJob(jobId: string, select: string): Promise<{ ok: true; job: McpJobRow } | { ok: false; error: string }> {
  const { data: job, error } = await supabase.from('jobs').select(select).eq('id', jobId).single();
  if (error && !isMissingRowError(error)) return { ok: false, error: `Error: ${error.message}` };
  const record = asRecord(job);
  if (!record) return { ok: false, error: 'Error: Job not found.' };
  const projectId = stringField(record, 'project_id');
  if (!isMcpProjectAllowed(projectId)) return { ok: false, error: mcpProjectScopeError(projectId) };
  return {
    ok: true,
    job: {
      project_id: projectId,
      task_id: stringField(record, 'task_id'),
      status: stringField(record, 'status'),
      answer: stringField(record, 'answer'),
    },
  };
}
