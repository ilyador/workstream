import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isMcpProjectAllowed, mcpProjectScopeError, mcpText } from './mcp-authz.js';
import { supabase } from './supabase.js';

export function registerMcpProjectSummaryTool(server: McpServer): void {
  server.tool('project_summary', 'Get full project state as LLM-readable markdown', {
    project_id: z.string().describe('Project UUID'),
  }, async ({ project_id }) => {
    if (!isMcpProjectAllowed(project_id)) return mcpText(mcpProjectScopeError(project_id));
    const [
      { data: project, error: projectError },
      { data: tasks, error: tasksError },
      { data: jobs, error: jobsError },
      { data: workstreams, error: workstreamsError },
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', project_id).single(),
      supabase.from('tasks').select('*').eq('project_id', project_id).order('position'),
      supabase.from('jobs').select('*').eq('project_id', project_id).order('started_at', { ascending: false }).limit(10),
      supabase.from('workstreams').select('*').eq('project_id', project_id).order('position'),
    ]);
    const summaryError = projectError || tasksError || jobsError || workstreamsError;
    if (summaryError) return mcpText(`Error: ${summaryError.message}`);

    const backlog = tasks?.filter(task => ['backlog', 'todo'].includes(task.status)) || [];
    const done = tasks?.filter(task => task.status === 'done') || [];
    const active = tasks?.filter(task => ['in_progress', 'paused', 'review'].includes(task.status)) || [];

    let md = `# Project: ${project?.name || 'Unknown'}\n\n`;

    if (workstreams && workstreams.length > 0) {
      md += `## Workstreams\n`;
      for (const workstream of workstreams) {
        const workstreamTasks = tasks?.filter(task => task.workstream_id === workstream.id) || [];
        const doneCount = workstreamTasks.filter(task => task.status === 'done').length;
        md += `- ${workstream.name} [${workstream.status || 'active'}]: ${doneCount}/${workstreamTasks.length} done\n`;
      }
      md += '\n';
    }

    if (active.length > 0) {
      md += `## Active\n`;
      for (const task of active) md += `- [${task.status}] ${task.title} (${task.type})\n`;
      md += '\n';
    }

    if (jobs && jobs.length > 0) {
      md += `## Recent Jobs\n`;
      for (const job of jobs.slice(0, 5)) {
        md += `- [${job.status}] ${job.current_phase || ''} ${job.status === 'paused' ? `-- ${job.question}` : ''}\n`;
      }
      md += '\n';
    }

    md += `## Backlog (${backlog.length} tasks)\n`;
    for (const task of backlog.slice(0, 10)) {
      md += `${backlog.indexOf(task) + 1}. ${task.title} (${task.type})\n`;
    }

    md += `\n## Done: ${done.length} tasks completed\n`;
    return mcpText(md);
  });
}
