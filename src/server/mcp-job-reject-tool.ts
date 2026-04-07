import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mcpText } from './mcp-authz.js';
import { loadScopedMcpJob } from './mcp-job-utils.js';
import { supabase } from './supabase.js';

export function registerMcpJobRejectTool(server: McpServer): void {
  server.tool('job_reject', 'Reject a job and send task back to backlog', {
    job_id: z.string(),
    note: z.string(),
  }, async ({ job_id, note }) => {
    const cleanNote = note.trim();
    if (!cleanNote) return mcpText('Error: note is required.');

    const loaded = await loadScopedMcpJob(job_id, 'project_id, task_id, status');
    if (!loaded.ok) return mcpText(loaded.error);
    const job = loaded.job;
    if (job.status !== 'review') return mcpText('Error: Job is not in review.');
    if (!job.task_id) return mcpText('Error: Job is missing task_id.');

    const { error: taskUpdateError } = await supabase.from('tasks').update({ status: 'backlog', followup_notes: cleanNote, completed_at: null }).eq('id', job.task_id);
    if (taskUpdateError) return mcpText(`Error: ${taskUpdateError.message}`);
    const { error: jobUpdateError } = await supabase.from('jobs').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', job_id);
    if (jobUpdateError) {
      const { error: rollbackError } = await supabase.from('tasks').update({ status: 'review', completed_at: null }).eq('id', job.task_id);
      if (rollbackError) console.error(`[mcp] Failed to roll back task ${job.task_id}:`, rollbackError.message);
      return mcpText(`Error: ${jobUpdateError.message}`);
    }
    return mcpText('Job rejected. Task returned to backlog with notes.');
  });
}
