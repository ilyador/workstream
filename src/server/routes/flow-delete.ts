import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireFlowAccess, requireProjectAdmin, routeParam } from '../authz.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';

export const flowDeleteRouter = Router();

flowDeleteRouter.delete('/api/flows/:id', requireAuth, async (req, res) => {
  const flowId = routeParam(req.params.id);
  const access = await requireFlowAccess(req, res, flowId, 'id, project_id');
  if (!access) return;
  const admin = await requireProjectAdmin(req, res, access.projectId);
  if (!admin) return;

  const { error } = await supabase.from('flows').delete().eq('id', flowId);
  if (error) return res.status(400).json({ error: error.message });
  broadcast(access.projectId, { type: 'flow_deleted', flow_id: flowId });
  res.json({ ok: true });
});
