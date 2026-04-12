import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { supabase } from './supabase.js';

const TASK_UPDATE_STATUSES = ['backlog', 'todo', 'in_progress', 'paused', 'review', 'done', 'canceled'];

export function registerMcpTaskUpdateTool(server: McpServer): void {
  server.tool('task_update', 'Update a task status or fields', {
    task_id: z.string(),
    status: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  }, async ({ task_id, ...updates }) => {
    const { data: taskRow, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', task_id).single();
    if (taskError) {
      if (isMissingRowError(taskError)) return mcpText('Error: task_id not found');
      console.error(`[mcp] Failed to load task ${task_id}:`, taskError.message);
      return mcpText('Error: failed to load task');
    }
    if (!isMcpProjectAllowed(taskRow?.project_id)) return mcpText(mcpProjectScopeError(taskRow?.project_id));

    const clean: Record<string, unknown> = {};
    if (updates.status !== undefined) {
      if (!TASK_UPDATE_STATUSES.includes(updates.status)) return mcpText(`Error: status must be one of: ${TASK_UPDATE_STATUSES.join(', ')}`);
      clean.status = updates.status;
      if (updates.status === 'done') clean.completed_at = new Date().toISOString();
      else clean.completed_at = null;
    }
    if (updates.title !== undefined) clean.title = updates.title;
    if (updates.description !== undefined) clean.description = updates.description;
    if (Object.keys(clean).length === 0) return mcpText('Error: no supported fields provided.');
    if (typeof clean.title === 'string') {
      clean.title = clean.title.trim();
      if (!clean.title) return mcpText('Error: title cannot be empty.');
    }

    const { error } = await supabase.from('tasks').update(clean).eq('id', task_id);
    if (error) {
      console.error(`[mcp] Failed to update task ${task_id}:`, error.message);
      return mcpText('Error: failed to update task');
    }
    return mcpText(`Task ${task_id} updated.`);
  });
}
