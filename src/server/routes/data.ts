import { Router } from 'express';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';
import { homedir } from 'os';
import { supabase } from '../supabase.js';
import { requireAuth } from '../auth-middleware.js';

export const dataRouter = Router();

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
  res.json(members);
});

// --- Milestones ---

dataRouter.get('/api/milestones', requireAuth, async (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).json({ error: 'project_id required' });

  const { data } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  res.json(data || []);
});

dataRouter.post('/api/milestones', requireAuth, async (req, res) => {
  const { project_id, name, deadline } = req.body;
  const { data, error } = await supabase
    .from('milestones')
    .insert({ project_id, name, deadline: deadline || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/milestones/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('milestones')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
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
  const { project_id, title, description, type, mode, effort, milestone_id, multiagent, assignee, blocked_by, images } = req.body;

  // Get max position
  const { data: maxTask } = await supabase
    .from('tasks')
    .select('position')
    .eq('project_id', project_id)
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
      effort: effort || 'high',
      multiagent: multiagent || 'auto',
      assignee: assignee || null,
      blocked_by: blocked_by || [],
      images: images || [],
      milestone_id: milestone_id || null,
      position: (maxTask?.position || 0) + 1,
      created_by: userId,
    })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

dataRouter.patch('/api/tasks/:id', requireAuth, async (req, res) => {
  const updates = { ...req.body };
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
        skills.push({ name, description: meta.description, source });
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
        }
      }
    } catch { /* skip */ }
  }

  return skills;
}

dataRouter.get('/api/skills', requireAuth, (req, res) => {
  const localPath = req.query.local_path as string | undefined;
  const skills = discoverSkills(localPath);
  res.json(skills);
});

// --- SSE: Realtime changes ---

const changeListeners = new Map<string, Set<(data: any) => void>>();

// Poll Supabase for changes every 2 seconds (simpler than WebSocket proxy)
setInterval(async () => {
  for (const [projectId, clients] of changeListeners) {
    if (clients.size === 0) { changeListeners.delete(projectId); continue; }
    // Fetch latest task and job updates
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, status, position, updated_at')
      .eq('project_id', projectId)
      .order('position');
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, status, current_phase, attempt')
      .eq('project_id', projectId)
      .order('started_at', { ascending: false })
      .limit(10);
    for (const send of clients) {
      send({ tasks: tasks || [], jobs: jobs || [] });
    }
  }
}, 2000);

dataRouter.get('/api/changes', (req, res) => {
  const projectId = req.query.project_id as string;
  if (!projectId) return res.status(400).end();

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
