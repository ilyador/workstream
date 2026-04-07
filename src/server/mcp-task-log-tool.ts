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
    if (taskError) return mcpText(`Error: ${isMissingRowError(taskError) ? 'task_id not found' : taskError.message}`);
    if (!isMcpProjectAllowed(taskRow?.project_id)) return mcpText(mcpProjectScopeError(taskRow?.project_id));
    const userId = await getSystemUserId(taskRow?.project_id);
    if (!userId) return mcpText('Error: Could not resolve a system user for comments. Create a profile named "WorkStream Bot" or ensure the project has a creator.');

    const { error } = await supabase.from('comments').insert({
      task_id,
      user_id: userId,
      body: cleanMessage,
    });
    if (error) return mcpText(`Error: ${error.message}`);
    return mcpText('Note added.');
  });
}
