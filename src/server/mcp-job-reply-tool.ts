import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { mcpText } from './mcp-authz.js';
import { loadScopedMcpJob } from './mcp-job-utils.js';
import { supabase } from './supabase.js';

export function registerMcpJobReplyTool(server: McpServer): void {
  server.tool('job_reply', 'Answer a paused job question', {
    job_id: z.string(),
    answer: z.string(),
  }, async ({ job_id, answer }) => {
    const cleanAnswer = answer.trim();
    if (!cleanAnswer) return mcpText('Error: answer is required.');

    const loaded = await loadScopedMcpJob(job_id, 'project_id, task_id, status, answer');
    if (!loaded.ok) return mcpText(loaded.error);
    const job = loaded.job;
    if (job.status !== 'paused') return mcpText('Error: Job is not paused.');
    if (!job.task_id) return mcpText('Error: Job is missing task_id.');

    const { error } = await supabase.from('jobs').update({ answer: cleanAnswer, status: 'queued' }).eq('id', job_id);
    if (error) return mcpText(`Error: ${error.message}`);
    const { error: taskUpdateError } = await supabase.from('tasks').update({ status: 'in_progress', completed_at: null }).eq('id', job.task_id);
    if (taskUpdateError) {
      const { error: rollbackError } = await supabase.from('jobs').update({ answer: job.answer ?? null, status: 'paused' }).eq('id', job_id);
      if (rollbackError) console.error(`[mcp] Failed to roll back job reply ${job_id}:`, rollbackError.message);
      return mcpText(`Error: ${taskUpdateError.message}`);
    }
    return mcpText('Reply sent. Job will resume on next execution.');
  });
}
