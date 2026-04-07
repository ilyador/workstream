import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireFlowAccess, routeParam } from '../authz.js';
import { withSortedFlowSteps } from '../flow-steps.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';

const FLOW_UPDATE_FIELDS = ['name', 'description', 'icon', 'agents_md', 'default_types', 'position'];

export const flowUpdateRouter = Router();

flowUpdateRouter.patch('/api/flows/:id', requireAuth, async (req, res) => {
  const flowId = routeParam(req.params.id);
  const access = await requireFlowAccess(req, res, flowId, 'id, project_id');
  if (!access) return;

  const updates: Record<string, unknown> = {};
  for (const key of FLOW_UPDATE_FIELDS) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported fields to update' });
  if ('name' in updates) {
    if (typeof updates.name !== 'string' || updates.name.trim().length === 0) return res.status(400).json({ error: 'name cannot be empty' });
    updates.name = updates.name.trim();
  }
  if ('description' in updates && updates.description != null && typeof updates.description !== 'string') {
    return res.status(400).json({ error: 'description must be a string' });
  }
  if ('icon' in updates && (typeof updates.icon !== 'string' || updates.icon.trim().length === 0)) {
    return res.status(400).json({ error: 'icon must be a non-empty string' });
  }
  if ('agents_md' in updates && updates.agents_md != null && typeof updates.agents_md !== 'string') {
    return res.status(400).json({ error: 'agents_md must be a string' });
  }
  if ('default_types' in updates && (!Array.isArray(updates.default_types) || !updates.default_types.every(type => typeof type === 'string' && type.trim().length > 0))) {
    return res.status(400).json({ error: 'default_types must be an array of non-empty strings' });
  }
  if (
    'position' in updates
    && updates.position != null
    && (typeof updates.position !== 'number' || !Number.isInteger(updates.position) || updates.position < 0)
  ) {
    return res.status(400).json({ error: 'position must be a non-negative integer' });
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('flows')
    .update(updates)
    .eq('id', flowId)
    .select('*, flow_steps(*)')
    .single();
  if (error) return res.status(400).json({ error: error.message });
  const sortedFlow = withSortedFlowSteps(data);
  broadcast(access.projectId, { type: 'flow_changed', flow: sortedFlow });
  res.json(sortedFlow);
});
