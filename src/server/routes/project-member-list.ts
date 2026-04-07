import { Router } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { requireProjectMember, routeParam } from '../authz.js';
import { supabase } from '../supabase.js';
import { memberListItem, pendingInviteItem } from './project-member-format.js';

export const projectMemberListRouter = Router();

projectMemberListRouter.get('/api/members', requireAuth, async (req, res) => {
  const projectId = typeof req.query.project_id === 'string' ? req.query.project_id : '';
  if (!projectId) return res.status(400).json({ error: 'project_id required' });
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return;

  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role, profiles(id, name, initials)')
    .eq('project_id', projectId);
  if (error) return res.status(400).json({ error: error.message });

  const members = (data || []).map((row: unknown) => memberListItem(row));

  const { data: invites, error: invitesError } = await supabase
    .from('project_invites')
    .select('id, email, role')
    .eq('project_id', projectId);
  if (invitesError) return res.status(400).json({ error: invitesError.message });

  for (const inv of invites || []) {
    const item = pendingInviteItem(inv);
    if (item) members.push(item);
  }

  res.json(members);
});

projectMemberListRouter.get('/api/projects/:id/members', requireAuth, async (req, res) => {
  const projectId = routeParam(req.params.id);
  if (!await requireProjectMember(req, res, projectId)) return;

  const [{ data, error }, { data: invites, error: invitesError }] = await Promise.all([
    supabase
      .from('project_members')
      .select('user_id, role, profiles(id, name, email, initials)')
      .eq('project_id', projectId),
    supabase
      .from('project_invites')
      .select('id, email, role')
      .eq('project_id', projectId),
  ]);
  if (error || invitesError) return res.status(400).json({ error: error?.message || invitesError?.message });

  const members = (data || []).map((row: unknown) => memberListItem(row, true));
  for (const inv of invites || []) {
    const item = pendingInviteItem(inv);
    if (item) members.push(item);
  }

  res.json(members);
});
