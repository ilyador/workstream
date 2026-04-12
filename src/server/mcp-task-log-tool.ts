import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { getSystemUserId } from './mcp-system-user.js';
import { supabase } from './supabase.js';

export function registerMcpTaskLogTool(server: McpServer): void {
  server.tool('task_log', 'Add a note/comment to a task', {
    task_id: z.string(),
    message: z.string(),
  }, async ({ task_id, message }) => {
    const cleanMessage = message.trim();
    if (!cleanMessage) return mcpText('Error: message is required.');

    const { data: taskRow, error: taskError } = await supabase.from('tasks').select('project_id').eq('id', task_id).single();
    if (taskError) {
      if (isMissingRowError(taskError)) return mcpText('Error: task_id not found');
      console.error(`[mcp] Failed to load task ${task_id}:`, taskError.message);
      return mcpText('Error: failed to load task');
    }
    if (!isMcpProjectAllowed(taskRow?.project_id)) return mcpText(mcpProjectScopeError(taskRow?.project_id));
    const userId = await getSystemUserId(taskRow?.project_id);
    if (!userId) return mcpText('Error: Could not resolve a system user for comments. Create a profile named "WorkStream Bot" or ensure the project has a creator.');

    const { error } = await supabase.from('comments').insert({
      task_id,
      user_id: userId,
      body: cleanMessage,
    });
    if (error) {
      console.error(`[mcp] Failed to insert comment on task ${task_id}:`, error.message);
      return mcpText('Error: failed to add note');
    }
    return mcpText('Note added.');
  });
}
