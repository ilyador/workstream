import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMissingRowError } from './authz.js';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { getSystemUserId } from './mcp-system-user.js';
import { supabase } from './supabase.js';

const CORE_TASK_TYPES = new Set(['bug-fix', 'feature', 'refactor', 'test', 'chore']);

export function registerMcpTaskCreateTool(server: McpServer): void {
  server.tool('task_create', 'Create a new task', {
    project_id: z.string(),
    title: z.string().max(500),
    type: z.string().max(50).default('feature'),
    description: z.string().max(20000).optional(),
    workstream_id: z.string().optional(),
  }, async ({ project_id, title, type, description, workstream_id }) => {
    if (!isMcpProjectAllowed(project_id)) return mcpText(mcpProjectScopeError(project_id));
    const cleanTitle = title.trim();
    if (!cleanTitle) return mcpText('Error: title is required.');
    if (!CORE_TASK_TYPES.has(type)) {
      const { data: customTypes, error: customTypesError } = await supabase
        .from('custom_task_types')
        .select('name')
        .eq('project_id', project_id);
      if (customTypesError) {
        console.error(`[mcp] Failed to load custom task types for project ${project_id}:`, customTypesError.message);
        return mcpText('Error: failed to validate task type');
      }
      const validCustomTypes = new Set((customTypes || []).map((t: { name: string }) => t.name));
      if (!validCustomTypes.has(type)) {
        const allTypes = [...CORE_TASK_TYPES, ...validCustomTypes].sort().join(', ');
        return mcpText(`Error: type must be one of: ${allTypes}`);
      }
    }
    if (workstream_id) {
      const { data: workstream, error: workstreamError } = await supabase
        .from('workstreams')
        .select('project_id')
        .eq('id', workstream_id)
        .single();
      if (workstreamError) {
        if (isMissingRowError(workstreamError)) return mcpText('Error: workstream_id not found');
        console.error(`[mcp] Failed to load workstream ${workstream_id}:`, workstreamError.message);
        return mcpText('Error: failed to load workstream');
      }
      if (workstream?.project_id !== project_id) return mcpText('Error: workstream_id does not belong to project_id');
    }

    const { data: maxTask, error: maxTaskError } = await supabase
      .from('tasks')
      .select('position')
      .eq('project_id', project_id)
      .order('position', { ascending: false })
      .limit(1)
      .single();
    if (maxTaskError && !isMissingRowError(maxTaskError)) {
      console.error(`[mcp] Failed to load max task position for project ${project_id}:`, maxTaskError.message);
      return mcpText('Error: failed to load project tasks');
    }

    const createdBy = await getSystemUserId(project_id);
    if (!createdBy) {
      return mcpText('Error: Could not resolve a system user for task creation. Create a profile named "WorkStream Bot" or ensure the project has a creator.');
    }

    const { data, error } = await supabase.from('tasks').insert({
      project_id,
      title: cleanTitle,
      type,
      description: description || '',
      workstream_id: workstream_id || null,
      position: (maxTask?.position ?? 0) + 1,
      created_by: createdBy,
    }).select().single();

    if (error) {
      console.error(`[mcp] Failed to insert task for project ${project_id}:`, error.message);
      return mcpText('Error: failed to create task');
    }
    return mcpText(`Created task: ${data.title} (${data.id})`);
  });
}
