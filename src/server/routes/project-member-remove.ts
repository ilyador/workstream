import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, requireProjectAdmin, routeParam } from '../authz.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';

export const projectMemberRemoveRouter = Router();

projectMemberRemoveRouter.delete('/api/projects/:id/members/:userId', requireAuth, async (req, res) => {
  const callerId = getUserId(req);
  const projectId = routeParam(req.params.id);
  const targetUserId = routeParam(req.params.userId);

  if (callerId === targetUserId) return res.status(400).json({ error: 'Cannot remove yourself from the project' });

  const admin = await requireProjectAdmin(req, res, projectId);
  if (!admin) return;

  const { data: deleted, error: deleteError } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', targetUserId)
    .select('user_id');
  if (deleteError) return res.status(400).json({ error: deleteError.message });

  if (!deleted || deleted.length === 0) {
    const { data: deletedInvites, error: invErr } = await supabase
      .from('project_invites')
      .delete()
      .eq('project_id', projectId)
      .eq('id', targetUserId)
      .select('id');
    if (invErr) return res.status(400).json({ error: invErr.message });
    if (!deletedInvites || deletedInvites.length === 0) return res.status(404).json({ error: 'Project member or invite not found' });
  }

  broadcast(projectId, { type: 'member_changed' });
  res.json({ ok: true });
});
