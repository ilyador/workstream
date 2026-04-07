import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { supabase } from './supabase.js';

export function registerMcpTaskCreateTool(server: McpServer): void {
  server.tool('task_create', 'Create a new task', {
    project_id: z.string(),
    title: z.string(),
    type: z.string().default('feature'),
    description: z.string().optional(),
    workstream_id: z.string().optional(),
  }, async ({ project_id, title, type, description, workstream_id }) => {
    if (!isMcpProjectAllowed(project_id)) return mcpText(mcpProjectScopeError(project_id));
    const cleanTitle = title.trim();
    if (!cleanTitle) return mcpText('Error: title is required.');
    if (workstream_id) {
      const { data: workstream, error: workstreamError } = await supabase
        .from('workstreams')
        .select('project_id')
        .eq('id', workstream_id)
        .single();
      if (workstreamError) return mcpText(`Error: ${isMissingRowError(workstreamError) ? 'workstream_id not found' : workstreamError.message}`);
      if (workstream?.project_id !== project_id) return mcpText('Error: workstream_id does not belong to project_id');
    }

    const { data: maxTask, error: maxTaskError } = await supabase
      .from('tasks')
      .select('position')
      .eq('project_id', project_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();
    if (maxTaskError && !isMissingRowError(maxTaskError)) return mcpText(`Error: ${maxTaskError.message}`);

    const { data, error } = await supabase.from('tasks').insert({
      project_id,
      title: cleanTitle,
      type,
      description: description || '',
      workstream_id: workstream_id || null,
      position: (maxTask?.position ?? 0) + 1,
    }).select().single();

    if (error) return mcpText(`Error: ${error.message}`);
    return mcpText(`Created task: ${data.title} (${data.id})`);
  });
}
