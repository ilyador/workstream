import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpTaskCreateTool } from './mcp-task-create-tool.js';
import { registerMcpTaskLogTool } from './mcp-task-log-tool.js';
import { registerMcpTaskUpdateTool } from './mcp-task-update-tool.js';

export function registerMcpTaskTools(server: McpServer): void {
  registerMcpTaskCreateTool(server);
  registerMcpTaskUpdateTool(server);
  registerMcpTaskLogTool(server);
}
