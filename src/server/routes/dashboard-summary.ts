import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember } from '../authz.js';
import { supabase } from '../supabase.js';

export const dashboardSummaryRouter = Router();

dashboardSummaryRouter.get('/api/summary', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  if (!await requireProjectMember(req, res, projectId)) return;

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
  if (projectError || tasksError || jobsError || workstreamsError) {
    return res.status(400).json({ error: projectError?.message || tasksError?.message || jobsError?.message || workstreamsError?.message });
  }

  const backlog = tasks?.filter(t => ['backlog', 'todo'].includes(t.status)) || [];
  const done = tasks?.filter(t => t.status === 'done') || [];
  const active = tasks?.filter(t => ['in_progress', 'paused', 'review'].includes(t.status)) || [];

  let md = `# Project: ${project?.name || 'Unknown'}\n\n`;

  if (workstreams && workstreams.length > 0) {
    md += `## Workstreams\n`;
    for (const ws of workstreams) {
      const wsTasks = tasks?.filter(t => t.workstream_id === ws.id) || [];
      const wsDone = wsTasks.filter(t => t.status === 'done').length;
      md += `- ${ws.name} [${ws.status || 'active'}]: ${wsDone}/${wsTasks.length} done\n`;
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

  res.json({ markdown: md });
});
