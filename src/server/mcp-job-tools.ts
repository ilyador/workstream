import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMcpJobApproveTool } from './mcp-job-approve-tool.js';
import { registerMcpJobRejectTool } from './mcp-job-reject-tool.js';
import { registerMcpJobReplyTool } from './mcp-job-reply-tool.js';

export function registerMcpJobTools(server: McpServer): void {
  registerMcpJobReplyTool(server);
  registerMcpJobApproveTool(server);
  registerMcpJobRejectTool(server);
}
