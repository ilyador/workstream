import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpProjectFocusTool } from './mcp-project-focus-tool.js';
import { registerMcpProjectSummaryTool } from './mcp-project-summary-tool.js';
import { registerMcpWorkstreamStatusTool } from './mcp-workstream-status-tool.js';

export function registerMcpProjectTools(server: McpServer): void {
  registerMcpProjectFocusTool(server);
  registerMcpProjectSummaryTool(server);
  registerMcpWorkstreamStatusTool(server);
}
