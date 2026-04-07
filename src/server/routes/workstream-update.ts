import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, requireWorkstreamAccess, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { normalizeWorkstreamUpdates } from './workstream-validation.js';

export const workstreamUpdateRouter = Router();

workstreamUpdateRouter.patch('/api/workstreams/:id', requireAuth, async (req, res) => {
  const workstreamId = routeParam(req.params.id);
  const access = await requireWorkstreamAccess(req, res, workstreamId);
  if (!access) return;
  const allowed = ['name', 'position', 'status', 'description', 'has_code', 'reviewer_id'];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No supported fields to update' });
  const validationError = await normalizeWorkstreamUpdates(updates, access.projectId);
  if (validationError) return res.status(400).json({ error: validationError });

  const { data, error } = await supabase
    .from('workstreams')
    .update(updates)
    .eq('id', workstreamId)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const userId = getUserId(req);
  if (typeof updates.reviewer_id === 'string' && updates.reviewer_id !== userId) {
    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: updates.reviewer_id,
      type: 'review_request',
      workstream_id: data.id,
      message: `You were assigned to review "${data.name}"`,
    });
    if (notificationError) console.error('[workstreams] Failed to create review notification:', notificationError.message);
  }

  res.json(data);
});
