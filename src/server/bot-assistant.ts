import { execFile } from 'child_process';
import { claudeEnv } from './claude-env.js';
import { supabase } from './supabase.js';

export async function buildProjectSummary(projectId: string): Promise<string> {
  const [
    { data: project, error: projectError },
    { data: tasks, error: tasksError },
    { data: jobs, error: jobsError },
    { data: workstreams, error: workstreamsError },
  ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('position'),
    supabase.from('jobs').select('*').eq('project_id', projectId).order('started_at', { ascending: false }).limit(10),
    supabase.from('workstreams').select('*').eq('project_id', projectId).order('position'),
  ]);
  const summaryError = projectError || tasksError || jobsError || workstreamsError;
  if (summaryError) throw new Error(`Failed to build project summary: ${summaryError.message}`);

  const backlog = tasks?.filter(t => ['backlog', 'todo'].includes(t.status)) || [];
  const done = tasks?.filter(t => t.status === 'done') || [];
  const active = tasks?.filter(t => ['in_progress', 'paused', 'review'].includes(t.status)) || [];

  let md = `# Project: ${project?.name || 'Unknown'}\n\n`;

  if (workstreams && workstreams.length > 0) {
    md += `## Workstreams\n`;
    for (const ws of workstreams) md += `- ${ws.name} (${ws.id})\n`;
    md += '\n';
  }

  if (active.length > 0) {
    md += `## Active\n`;
    for (const t of active) md += `- [${t.status}] ${t.title} (${t.type}, id: ${t.id})\n`;
    md += '\n';
  }

  if (jobs && jobs.length > 0) {
    md += `## Recent Jobs\n`;
    for (const j of jobs.slice(0, 5)) {
      md += `- [${j.status}] ${j.current_phase || ''} ${j.status === 'paused' ? `-- ${j.question}` : ''}\n`;
    }
    md += '\n';
  }

  md += `## Backlog (${backlog.length} tasks)\n`;
  for (const t of backlog.slice(0, 15)) {
    md += `- ${t.title} (${t.type}, id: ${t.id})\n`;
  }

  md += `\n## Done: ${done.length} tasks completed\n`;
  return md;
}

export function askClaude(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile('claude', ['-p', '--output-format', 'text', '--max-turns', '3'], {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
      env: claudeEnv,
    }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
    proc.stdin?.write(`${systemPrompt}\n\nUser message: ${userMessage}`);
    proc.stdin?.end();
  });
}

export function buildSystemPrompt(projectName: string, summary: string): string {
  return `You are the WorkStream project assistant for "${projectName}". Here is the current project state:

${summary}

You can take actions by including ACTION lines in your response. Format:
ACTION: action_name {"param": "value"}

Available actions:
- create_task: Create a new task. Params: title (required), type (bug-fix|feature|refactor|test|chore, default: feature), description (optional), workstream_id (optional)
- update_task: Update task status. Params: task_id (required), status (backlog|done|canceled), title (optional)
- add_comment: Add a comment to a task. Params: task_id (required), message (required)

Rules:
- Keep responses concise and helpful. This is a Telegram chat, not a document.
- When users ask to create or update tasks, include the appropriate ACTION line.
- When listing tasks, use the data from the project state above.
- You can include multiple ACTION lines if needed.
- Do NOT wrap your response in markdown code fences.`;
}
