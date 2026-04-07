import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { asRecord, getUserId } from '../authz.js';
import { supabase } from '../supabase.js';

export const projectListRouter = Router();

projectListRouter.get('/api/projects', requireAuth, async (req, res) => {
  const userId = getUserId(req);

  const { data, error } = await supabase
    .from('project_members')
    .select('project_id, role, local_path, projects(id, name, created_at)')
    .eq('user_id', userId);
  if (error) return res.status(400).json({ error: error.message });

  const projects = (data || []).map((row: unknown) => {
    const record = asRecord(row) || {};
    const project = asRecord(record.projects) || {};
    return {
      id: project.id,
      name: project.name,
      role: record.role,
      local_path: record.local_path,
      created_at: project.created_at,
    };
  });
  res.json(projects);
});
