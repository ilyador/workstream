import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireCustomTypeAccess, requireProjectAdmin, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const customTypeDeleteRouter = Router();

customTypeDeleteRouter.delete('/api/custom-types/:id', requireAuth, async (req, res) => {
  const customTypeId = routeParam(req.params.id);
  const access = await requireCustomTypeAccess(req, res, customTypeId, 'id, project_id');
  if (!access) return;
  const admin = await requireProjectAdmin(req, res, access.projectId);
  if (!admin) return;
  const { error } = await supabase.from('custom_task_types').delete().eq('id', customTypeId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
