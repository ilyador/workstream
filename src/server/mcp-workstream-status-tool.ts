import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { supabase } from './supabase.js';

export function registerMcpWorkstreamStatusTool(server: McpServer): void {
  server.tool('workstream_status', 'Get workstream progress and blockers', {
    workstream_id: z.string(),
  }, async ({ workstream_id }) => {
    const { data: workstream, error: workstreamError } = await supabase.from('workstreams').select('*').eq('id', workstream_id).single();
    if (workstreamError && !isMissingRowError(workstreamError)) return mcpText(`Error: ${workstreamError.message}`);
    if (!workstream) return mcpText('Workstream not found.');
    if (!isMcpProjectAllowed(workstream.project_id)) return mcpText(mcpProjectScopeError(workstream.project_id));

    const { data: tasks, error: tasksError } = await supabase.from('tasks').select('*').eq('workstream_id', workstream_id);
    if (tasksError) return mcpText(`Error: ${tasksError.message}`);
    const done = tasks?.filter(task => task.status === 'done').length || 0;
    const total = tasks?.length || 0;
    const blocked = tasks?.filter(task => task.status === 'paused').length || 0;

    const text = `## ${workstream.name}\nStatus: ${workstream.status || 'active'}\nProgress: ${done}/${total}\nBlocked: ${blocked} tasks`;
    return mcpText(text);
  });
}
