import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { supabase } from './supabase.js';

export function registerMcpProjectFocusTool(server: McpServer): void {
  server.tool('project_focus', 'Get the current focus task and why it was chosen', {
    project_id: z.string().describe('Project UUID'),
  }, async ({ project_id }) => {
    if (!isMcpProjectAllowed(project_id)) return mcpText(mcpProjectScopeError(project_id));
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', project_id)
      .in('status', ['backlog', 'todo'])
      .order('position', { ascending: true })
      .limit(3);
    if (error) return mcpText(`Error: ${error.message}`);

    if (!tasks || tasks.length === 0) return mcpText('No actionable tasks in backlog.');

    const focus = tasks[0];
    const text = `## Focus: ${focus.title}\nType: ${focus.type} | Effort: ${focus.effort} | Mode: ${focus.mode}\n${focus.description || ''}`;
    return mcpText(text);
  });
}
