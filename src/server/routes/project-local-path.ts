import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, normalizeRegisteredLocalPath, requireProjectMember, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const projectLocalPathRouter = Router();

projectLocalPathRouter.patch('/api/projects/:id/local-path', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const projectId = routeParam(req.params.id);
  const { local_path } = req.body;
  if (typeof local_path !== 'string' || local_path.trim().length === 0) {
    return res.status(400).json({ error: 'local_path must be a non-empty string' });
  }
  const normalizedLocalPath = normalizeRegisteredLocalPath(local_path);
  if (normalizedLocalPath.error) return res.status(400).json({ error: normalizedLocalPath.error });
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  const { data, error } = await supabase
    .from('project_members')
    .update({ local_path: normalizedLocalPath.path })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select('project_id');

  if (error) return res.status(400).json({ error: error.message });
  if (!data || data.length === 0) return res.status(404).json({ error: 'Project membership not found' });
  res.json({ ok: true });
});
