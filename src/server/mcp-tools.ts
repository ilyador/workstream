import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpJobTools } from './mcp-job-tools.js';
import { registerMcpProjectTools } from './mcp-project-tools.js';
import { registerMcpTaskTools } from './mcp-task-tools.js';

export function registerMcpTools(server: McpServer): void {
  registerMcpProjectTools(server);
  registerMcpTaskTools(server);
  registerMcpJobTools(server);
}
