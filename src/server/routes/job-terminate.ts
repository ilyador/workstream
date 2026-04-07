import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireJobAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';

export const jobTerminateRouter = Router();

jobTerminateRouter.post('/api/jobs/:id/terminate', requireAuth, async (req, res) => {
  const jobId = routeParam(req.params.id);
  const access = await requireJobAccess(req, res, jobId, 'id, project_id, status');
  if (!access) return;
  if (!['queued', 'running', 'paused', 'review'].includes(String(access.record.status))) {
    return res.status(400).json({ error: 'Job is not active' });
  }
  const { error } = await supabase.from('jobs').update({ status: 'canceling' }).eq('id', jobId);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});
