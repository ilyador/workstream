const allowedMcpProjectIds = new Set(
  (process.env.MCP_ALLOWED_PROJECT_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
);

export function mcpText(text: string): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text }] };
}

export function isMcpProjectAllowed(projectId: unknown): projectId is string {
  return typeof projectId === 'string' && projectId.length > 0 && (allowedMcpProjectIds.size === 0 || allowedMcpProjectIds.has(projectId));
}

export function mcpProjectScopeError(projectId: unknown): string {
  return typeof projectId === 'string' && projectId.length > 0
    ? 'Error: Project is not allowed for this MCP server.'
    : 'Error: Record is missing project_id.';
}
