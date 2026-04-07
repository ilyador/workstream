import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectAdmin, requireWorkstreamAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const workstreamDeleteRouter = Router();

workstreamDeleteRouter.delete('/api/workstreams/:id', requireAuth, async (req, res) => {
  const workstreamId = routeParam(req.params.id);
  const access = await requireWorkstreamAccess(req, res, workstreamId);
  if (!access) return;
  const admin = await requireProjectAdmin(req, res, access.projectId);
  if (!admin) return;

  const { error } = await supabase.from('workstreams').delete().eq('id', workstreamId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
