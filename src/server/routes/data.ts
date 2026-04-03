import { Router } from 'express';
import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';
import { homedir } from 'os';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';
import { queueNextWorkstreamTask } from '../auto-continue.js';

export const dataRouter = Router();

// Helper: derive display name + initials from an email address
function deriveNameFromEmail(email: string): { name: string; initials: string } {
  const name = email.split('@')[0];
  const parts = name.split(/[.\-_]/);
  const initials = (parts[0][0] + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
  return { name, initials };
}

// Helper: persist supabase config to .env file
function persistSupabaseConfig(config: { mode: string; url?: string; serviceRoleKey?: string }) {
  const envPath = resolve(process.cwd(), '.env');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  function setEnvVar(content: string, key: string, value: string): string {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, `${key}=${value}`);
    }
    return content + (content.endsWith('\n') || content === '' ? '' : '\n') + `${key}=${value}\n`;
  }

  if (config.mode === 'local') {
    envContent = setEnvVar(envContent, 'SUPABASE_URL', 'http://127.0.0.1:54321');
    envContent = setEnvVar(envContent, 'SUPABASE_MODE', 'local');
  } else if (config.mode === 'cloud' && config.url && config.serviceRoleKey) {
    envContent = setEnvVar(envContent, 'SUPABASE_URL', config.url);
    envContent = setEnvVar(envContent, 'SUPABASE_SERVICE_ROLE_KEY', config.serviceRoleKey);
    envContent = setEnvVar(envContent, 'SUPABASE_MODE', 'cloud');
  }

  writeFileSync(envPath, envContent, 'utf-8');
}

// --- Projects ---

dataRouter.get('/api/projects', requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  const { data } = await supabase
    .from('project_members')
    .select('project_id, role, local_path, projects(id, name, created_at)')
    .eq('user_id', userId);

  const projects = (data || []).map((d: any) => ({
    id: d.projects.id,
    name: d.projects.name,
    role: d.role,
    local_path: d.local_path,
    created_at: d.projects.created_at,
  }));
  res.json(projects);
});

dataRouter.post('/api/projects', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { name, supabase_config, local_path } = req.body;

  // Persist supabase connection config if provided
  if (supabase_config) {
    try {
      persistSupabaseConfig(supabase_config);
    } catch (err: any) {
      console.warn('Failed to persist supabase config:', err.message);
    }
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ name, created_by: userId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('project_members').insert({
    project_id: project.id,
    user_id: userId,
    role: 'admin',
    local_path: local_path || null,
  });

  res.json(project);
});

// Update project member's local_path
dataRouter.patch('/api/projects/:id/local-path', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { local_path } = req.body;

  const { error } = await supabase
    .from('project_members')
    .update({ local_path })
    .eq('project_id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// --- Members ---

dataRouter.get('/api/members', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('project_members')
    .select('user_id, role, profiles(id, name, initials)')
    .eq('project_id', projectId);

  const members = (data || []).map((d: any) => ({
    id: d.user_id,
    name: d.profiles?.name || 'Unknown',
    initials: d.profiles?.initials || '??',
    role: d.role,
  }));

  // Include pending invites
  const { data: invites, error: invErr } = await supabase
    .from('project_invites')
    .select('id, email, role')
    .eq('project_id', projectId);

  for (const inv of invites || []) {
    const parts = inv.email.split('@')[0].split(/[.\-_]/);
    const initials = (parts[0][0] + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
    members.push({ id: inv.id, name: inv.email, email: inv.email, initials, role: inv.role, pending: true });
  }

  res.json(members);
});

// --- Workstreams ---

dataRouter.get('/api/workstreams', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('workstreams')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  res.json(data || []);
});

dataRouter.post('/api/workstreams', requireAuth, async (req, res) => {
  const { project_id, name, description, has_code } = req.body;

  // Auto-assign position: max position + 1 for this project
  const { data: maxWs } = await supabase
    .from('workstreams')
    .select('position')
    .eq('project_id', project_id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const insert: Record<string, any> = {
    project_id,
    name,
    position: (maxWs?.position || 0) + 1,
  };
  if (description !== undefined) insert.description = description;
  if (has_code !== undefined) insert.has_code = has_code;

  const { data, error } = await supabase
    .from('workstreams')
    .insert(insert)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/workstreams/:id', requireAuth, async (req, res) => {
  const allowed = ['name', 'position', 'status', 'description', 'has_code'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  const { data, error } = await supabase
    .from('workstreams')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.delete('/api/workstreams/:id', requireAuth, async (req, res) => {
  // Tasks revert to backlog via ON DELETE SET NULL in DB
  const { error } = await supabase.from('workstreams').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// --- Tasks ---

dataRouter.get('/api/tasks', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('position', { ascending: true });
  res.json(data || []);
});

dataRouter.post('/api/tasks', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { project_id, title, description, type, mode, effort, workstream_id, multiagent, assignee, auto_continue, images, priority } = req.body;

  // Get max position, scoped to workstream
  let posQuery = supabase
    .from('tasks')
    .select('position')
    .eq('project_id', project_id);
  if (workstream_id) {
    posQuery = posQuery.eq('workstream_id', workstream_id);
  } else {
    posQuery = posQuery.is('workstream_id', null);
  }
  const { data: maxTask } = await posQuery
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id,
      title,
      description: description || '',
      type: type || 'feature',
      mode: mode || 'ai',
      effort: effort || 'max',
      multiagent: multiagent || 'auto',
      assignee: assignee || null,
      auto_continue: auto_continue !== undefined ? auto_continue : true,
      images: images || [],
      workstream_id: workstream_id || null,
      priority: priority || 'backlog',
      position: (maxTask?.position || 0) + 1,
      created_by: userId,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const allowed = ['title', 'description', 'type', 'mode', 'effort', 'multiagent', 'status', 'assignee', 'workstream_id', 'position', 'images', 'followup_notes', 'auto_continue', 'priority'];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (updates.status === 'done' && !updates.completed_at) {
    updates.completed_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Auto-continue: when task is marked done, queue next AI task in workstream
  if (updates.status === 'done' && data.auto_continue === true && data.workstream_id != null) {
    try {
      const userId = (req as any).userId;
      const { data: member } = await supabase
        .from('project_members')
        .select('local_path')
        .eq('project_id', data.project_id)
        .eq('user_id', userId)
        .single();
      if (member?.local_path) {
        await queueNextWorkstreamTask({
          completedTaskId: data.id,
          projectId: data.project_id,
          localPath: member.local_path,
          workstreamId: data.workstream_id,
          completedPosition: data.position,
        });
      }
    } catch (err: any) {
      console.error('[auto-continue] Error:', err.message);
    }
  }

  res.json(data);
});

dataRouter.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// --- Jobs ---

dataRouter.get('/api/jobs', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('jobs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(20);
  res.json(data || []);
});

dataRouter.delete('/api/jobs/:id', requireAuth, async (req, res) => {
  // Fetch the job first to get task_id and status
  const { data: job } = await supabase.from('jobs').select('task_id, status').eq('id', req.params.id).single();

  const { error } = await supabase.from('jobs').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  // If the dismissed job was failed, reset the task to backlog
  if (job && job.status === 'failed') {
    await supabase.from('tasks').update({ status: 'backlog' }).eq('id', job.task_id);
  }

  res.json({ ok: true });
});

// --- Comments ---

dataRouter.get('/api/comments', requireAuth, async (req, res) => {
  const taskId = req.query.task_id as string;
  if (!taskId) return res.status(400).json({ error: 'task_id required' });

  const { data } = await supabase
    .from('comments')
    .select('*, profiles(name, initials)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  res.json(data || []);
});

dataRouter.post('/api/comments', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const { task_id, body } = req.body;
  const { data, error } = await supabase
    .from('comments')
    .insert({ task_id, user_id: userId, body })
    .select('*, profiles(name, initials)')
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // After the comment insert succeeds, parse @mentions
  const mentions = (body as string).match(/@(\w+)/g);
  if (mentions) {
    // Look up profiles by name (case-insensitive)
    for (const mention of mentions) {
      const name = mention.slice(1); // remove @
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('name', name)
        .limit(1)
        .single();

      if (profile && profile.id !== userId) {
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'mention',
          task_id,
          message: `You were mentioned in a comment on a task`,
        });
      }
    }
  }

  res.json(data);
});

// --- Notifications ---

dataRouter.get('/api/notifications', requireAuth, async (req, res) => {
  const userId = (req as any).userId;

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  res.json(data || []);
});

dataRouter.patch('/api/notifications/:id/read', requireAuth, async (_req, res) => {
  await supabase.from('notifications').update({ read: true }).eq('id', _req.params.id);
  res.json({ ok: true });
});

dataRouter.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  res.json({ ok: true });
});

// --- Skills discovery ---

export interface SkillInfo {
  name: string;
  description: string;
  source: string; // 'global' | 'project' | plugin name
  filePath: string;
}

function parseSkillFrontmatter(filePath: string): { description: string } | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return { description: '' };
    const frontmatter = match[1];
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    return { description: descMatch?.[1]?.trim() || '' };
  } catch {
    return null;
  }
}

export function discoverSkills(localPath?: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  function addFromDir(dir: string, source: string) {
    if (!existsSync(dir)) return;
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const name = basename(file, '.md');
        if (seen.has(name)) continue;
        const meta = parseSkillFrontmatter(join(dir, file));
        if (!meta) continue;
        seen.add(name);
        skills.push({ name, description: meta.description, source, filePath: join(dir, file) });
      }
    } catch { /* skip unreadable dirs */ }
  }

  // Project-level commands (highest priority)
  if (localPath) {
    addFromDir(join(localPath, '.claude', 'commands'), 'project');
  }

  // Global user commands
  const home = homedir();
  addFromDir(join(home, '.claude', 'commands'), 'global');

  // Installed plugins
  const pluginsDir = join(home, '.claude', 'plugins', 'marketplaces');
  if (existsSync(pluginsDir)) {
    try {
      for (const marketplace of readdirSync(pluginsDir)) {
        const mpPlugins = join(pluginsDir, marketplace, 'plugins');
        if (!existsSync(mpPlugins)) continue;
        for (const plugin of readdirSync(mpPlugins)) {
          const cmdDir = join(mpPlugins, plugin, 'commands');
          addFromDir(cmdDir, plugin);

          // Also scan skills/ subdirectory for each plugin
          const skillsDir = join(mpPlugins, plugin, 'skills');
          if (existsSync(skillsDir)) {
            try {
              for (const skillName of readdirSync(skillsDir)) {
                const skillDir = join(skillsDir, skillName);
                try { if (!statSync(skillDir).isDirectory()) continue; } catch { continue; }
                if (seen.has(skillName)) continue;
                // Look for the main skill file: skillName.md, SKILL.md, or first .md
                const candidateFiles = [
                  join(skillDir, `${skillName}.md`),
                  join(skillDir, 'SKILL.md'),
                ];
                let filePath: string | null = null;
                for (const cf of candidateFiles) {
                  if (existsSync(cf)) { filePath = cf; break; }
                }
                if (!filePath) {
                  const altFile = readdirSync(skillDir).find(f => f.endsWith('.md'));
                  if (altFile) filePath = join(skillDir, altFile);
                }
                if (!filePath) continue;
                const meta = parseSkillFrontmatter(filePath);
                if (!meta) continue;
                seen.add(skillName);
                skills.push({ name: `${plugin}:${skillName}`, description: meta.description, source: plugin, filePath });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }
  }

  return skills;
}

dataRouter.get('/api/skills', requireAuth, (req, res) => {
  const localPath = req.query.local_path as string | undefined;
  const skills = discoverSkills(localPath);
  // Strip filePath from API response — internal use only
  res.json(skills.map(({ filePath, ...rest }) => rest));
});

// --- Custom Task Types ---

dataRouter.get('/api/custom-types', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('custom_task_types')
    .select('*')
    .eq('project_id', projectId)
    .order('name');
  res.json(data || []);
});

dataRouter.post('/api/custom-types', requireAuth, async (req, res) => {
  const { project_id, name, description, pipeline } = req.body;
  if (!project_id || !name?.trim()) return res.status(400).json({ error: 'project_id and name required' });

  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  const { data, error } = await supabase
    .from('custom_task_types')
    .insert({
      project_id,
      name: slug,
      description: description || '',
      pipeline: pipeline || 'feature',
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.delete('/api/custom-types/:id', requireAuth, async (req, res) => {
  const { error } = await supabase.from('custom_task_types').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// --- Focus ---

dataRouter.get('/api/focus', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['backlog', 'todo'])
    .order('position', { ascending: true });

  if (!tasks || tasks.length === 0) {
    return res.json({ task: null });
  }

  // Focus = first task ordered by position
  const focus = tasks[0];
  const next = tasks[1] || null;
  const then = tasks[2] || null;

  res.json({
    task: focus,
    reason: 'First task by position',
    next: next ? { id: next.id, title: next.title } : null,
    then: then ? { id: then.id, title: then.title } : null,
  });
});

// --- Summary ---

dataRouter.get('/api/summary', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const [{ data: project }, { data: tasks }, { data: jobs }, { data: workstreams }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('position'),
    supabase.from('jobs').select('*').eq('project_id', projectId).order('started_at', { ascending: false }).limit(10),
    supabase.from('workstreams').select('*').eq('project_id', projectId).order('position'),
  ]);

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
    for (const t of active) md += `- [${t.status}] ${t.title} (${t.type})\n`;
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
  for (const t of backlog.slice(0, 10)) {
    md += `${backlog.indexOf(t) + 1}. ${t.title} (${t.type})\n`;
  }

  md += `\n## Done: ${done.length} tasks completed\n`;

  res.json({ markdown: md });
});

// --- Single Task ---

dataRouter.get('/api/tasks/:id', requireAuth, async (req, res) => {
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: error.message });

  const [{ data: jobs }, { data: comments }] = await Promise.all([
    supabase.from('jobs').select('*').eq('task_id', req.params.id).order('started_at', { ascending: false }),
    supabase.from('comments').select('*, profiles(name, initials)').eq('task_id', req.params.id).order('created_at', { ascending: true }),
  ]);

  res.json({ task, jobs: jobs || [], comments: comments || [] });
});

// --- Invite Flow ---

dataRouter.post('/api/projects/:id/invite', requireAuth, async (req, res) => {
  const userId = (req as any).userId;
  const projectId = req.params.id;
  const { email, role } = req.body;

  if (!email || !role) return res.status(400).json({ error: 'email and role required' });
  if (role !== 'admin' && role !== 'dev' && role !== 'manager') return res.status(400).json({ error: 'role must be admin, dev, or manager' });

  // Check caller is admin
  const { data: callerMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  if (!callerMember || callerMember.role !== 'admin') {
    return res.status(403).json({ error: 'Only project admins can invite members' });
  }

  // Look up profile by email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, email, initials')
    .eq('email', email)
    .single();

  if (profile) {
    // User already has an account — add directly to project_members
    const { data: existing } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', profile.id)
      .single();
    if (existing) return res.status(400).json({ error: 'User is already a member of this project' });

    const { data: member, error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: profile.id, role })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    res.json({ ok: true, member: { ...member, name: profile.name, email: profile.email, initials: profile.initials } });
  } else {
    // User doesn't have an account yet — store as pending invite
    const { data: existingInvite } = await supabase
      .from('project_invites')
      .select('id')
      .eq('project_id', projectId)
      .eq('email', email)
      .single();
    if (existingInvite) return res.status(400).json({ error: 'This email has already been invited' });

    const { data: invite, error } = await supabase
      .from('project_invites')
      .insert({ project_id: projectId, email, role, invited_by: userId })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    const { initials } = deriveNameFromEmail(email);
    res.json({ ok: true, member: { id: invite.id, name: email, email, initials, role, pending: true } });
  }
});

dataRouter.delete('/api/projects/:id/members/:userId', requireAuth, async (req, res) => {
  const callerId = (req as any).userId;
  const projectId = req.params.id;
  const targetUserId = req.params.userId;

  // Check not removing yourself
  if (callerId === targetUserId) {
    return res.status(400).json({ error: 'Cannot remove yourself from the project' });
  }

  // Check caller is admin
  const { data: callerMember } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', callerId)
    .single();
  if (!callerMember || callerMember.role !== 'admin') {
    return res.status(403).json({ error: 'Only project admins can remove members' });
  }

  // Try removing from project_members first
  const { data: deleted } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', targetUserId)
    .select();

  if (!deleted || deleted.length === 0) {
    // Not a member — try removing a pending invite (targetUserId is the invite id)
    const { error: invErr } = await supabase
      .from('project_invites')
      .delete()
      .eq('project_id', projectId)
      .eq('id', targetUserId);
    if (invErr) return res.status(400).json({ error: invErr.message });
  }

  res.json({ ok: true });
});

dataRouter.get('/api/projects/:id/members', requireAuth, async (req, res) => {
  const projectId = req.params.id;

  const [{ data }, { data: invites }] = await Promise.all([
    supabase
      .from('project_members')
      .select('user_id, role, profiles(id, name, email, initials)')
      .eq('project_id', projectId),
    supabase
      .from('project_invites')
      .select('id, email, role')
      .eq('project_id', projectId),
  ]);

  const members = (data || []).map((d: any) => ({
    id: d.user_id,
    name: d.profiles?.name || 'Unknown',
    email: d.profiles?.email || '',
    initials: d.profiles?.initials || '??',
    role: d.role,
  }));

  // Include pending invites

  for (const inv of invites || []) {
    const { initials } = deriveNameFromEmail(inv.email);
    members.push({ id: inv.id, name: inv.email, email: inv.email, initials, role: inv.role, pending: true });
  }

  res.json(members);
});

// --- SSE: Event-driven realtime changes ---

const changeListeners = new Map<string, Set<(data: any) => void>>();

/** Broadcast an event to all SSE clients for a project. */
export function broadcast(projectId: string, event: { type: string; [key: string]: any }) {
  const clients = changeListeners.get(projectId);
  if (!clients || clients.size === 0) return;
  for (const send of clients) {
    send(event);
  }
}

// Subscribe to Supabase realtime for tasks and jobs changes.
// Any mutation from any file (routes, worker, runner, MCP, bot) triggers this.
supabase.channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
    const record = (payload.new as any) || (payload.old as any);
    if (!record?.project_id) return;
    broadcast(record.project_id, {
      type: payload.eventType === 'DELETE' ? 'task_deleted' : 'task_changed',
      task: record,
    });
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, (payload) => {
    const record = (payload.new as any) || (payload.old as any);
    if (!record?.project_id) return;
    broadcast(record.project_id, {
      type: payload.eventType === 'DELETE' ? 'job_deleted' : 'job_changed',
      job: record,
    });
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workstreams' }, (payload) => {
    const record = (payload.new as any) || (payload.old as any);
    if (!record?.project_id) return;
    broadcast(record.project_id, {
      type: 'workstream_changed',
      workstream: record,
    });
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('[realtime] Subscribed to tasks + jobs changes');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[realtime] Channel error — falling back to polling');
      startPollingFallback();
    }
  });

// Fallback polling in case Supabase realtime isn't available (e.g. local without realtime)
let pollingActive = false;
function startPollingFallback() {
  if (pollingActive) return;
  pollingActive = true;
  console.log('[realtime] Polling fallback active (every 3s)');
  setInterval(async () => {
    for (const [projectId, clients] of changeListeners) {
      if (clients.size === 0) { changeListeners.delete(projectId); continue; }
      const [{ data: tasks }, { data: jobs }, { data: workstreams }] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, status, position, workstream_id')
          .eq('project_id', projectId)
          .order('position'),
        supabase
          .from('jobs')
          .select('id, status, current_phase, attempt')
          .eq('project_id', projectId)
          .order('started_at', { ascending: false })
          .limit(10),
        supabase
          .from('workstreams')
          .select('id, name, status, position, pr_url')
          .eq('project_id', projectId)
          .order('position'),
      ]);
      for (const send of clients) {
        send({ type: 'full_sync', tasks: tasks || [], jobs: jobs || [], workstreams: workstreams || [] });
      }
    }
  }, 3000);
}

dataRouter.get('/api/changes', async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).end();
  const token = req.query.token as string;
  if (token) {
    const { error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const send = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!changeListeners.has(projectId)) changeListeners.set(projectId, new Set());
  changeListeners.get(projectId)!.add(send);

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    changeListeners.get(projectId)?.delete(send);
  });
});
