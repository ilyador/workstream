import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { getUserId, isMissingRowError, requireProjectAdmin, routeParam } from '../authz.js';
import { broadcast } from '../realtime.js';
import { supabase } from '../supabase.js';
import { deriveNameFromEmail } from './project-member-format.js';
import { normalizeInviteInput } from './project-invite-validation.js';

export const projectInviteCreateRouter = Router();

projectInviteCreateRouter.post('/api/projects/:id/invite', requireAuth, async (req, res) => {
  const userId = getUserId(req);
  const projectId = routeParam(req.params.id);
  const inviteInput = normalizeInviteInput(req.body.email, req.body.role);
  if (!inviteInput.ok) return res.status(400).json({ error: inviteInput.error });
  const admin = await requireProjectAdmin(req, res, projectId);
  if (!admin) return;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, initials')
    .eq('email', inviteInput.email)
    .single();
  if (profileError && !isMissingRowError(profileError)) return res.status(400).json({ error: profileError.message });

  if (profile) {
    const { data: existing, error: existingError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('user_id', profile.id)
      .single();
    if (existingError && !isMissingRowError(existingError)) return res.status(400).json({ error: existingError.message });
    if (existing) return res.status(400).json({ error: 'User is already a member of this project' });

    const { data: member, error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: profile.id, role: inviteInput.role })
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });

    broadcast(projectId, { type: 'member_changed' });
    return res.json({ ok: true, member: { ...member, name: profile.name, email: profile.email, initials: profile.initials } });
  }

  const { data: existingInvite, error: inviteLookupError } = await supabase
    .from('project_invites')
    .select('id')
    .eq('project_id', projectId)
    .eq('email', inviteInput.email)
    .single();
  if (inviteLookupError && !isMissingRowError(inviteLookupError)) return res.status(400).json({ error: inviteLookupError.message });
  if (existingInvite) return res.status(400).json({ error: 'This email has already been invited' });

  const { data: invite, error } = await supabase
    .from('project_invites')
    .insert({ project_id: projectId, email: inviteInput.email, role: inviteInput.role, invited_by: userId })
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  const { initials } = deriveNameFromEmail(inviteInput.email);
  broadcast(projectId, { type: 'member_changed' });
  res.json({ ok: true, member: { id: invite.id, name: inviteInput.email, email: inviteInput.email, initials, role: inviteInput.role, pending: true } });
});
