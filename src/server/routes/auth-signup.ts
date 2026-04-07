import { Router } from 'express';
import { isMissingRowError } from '../authz.js';
import { adminClient, initialsForName, normalizedEmail, type AdminUserLike } from './auth-utils.js';

export const authSignupRouter = Router();

authSignupRouter.post('/api/auth/signup', async (req, res) => {
  const { password, name } = req.body;
  const email = normalizedEmail(req.body.email);
  const cleanName = typeof name === 'string' ? name.trim() : '';

  if (!email) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!cleanName) return res.status(400).json({ error: 'Name is required' });

  const admin = adminClient();
  const { data, error } = await admin.auth.signUp({
    email,
    password,
    options: { data: { name: cleanName } },
  });

  if (!error) return res.json({ user: data.user, session: data.session });

  // Handle ghost accounts created by old invite flow, but only for pending invites.
  const { data: pendingInvite, error: pendingInviteError } = await admin
    .from('project_invites')
    .select('id')
    .eq('email', email)
    .limit(1)
    .single();
  if (pendingInviteError && !isMissingRowError(pendingInviteError)) return res.status(400).json({ error: pendingInviteError.message });
  if (!pendingInvite) return res.status(400).json({ error: error.message });

  const { data: { users }, error: listUsersError } = await admin.auth.admin.listUsers();
  if (listUsersError) return res.status(400).json({ error: listUsersError.message });

  const ghost = (users as AdminUserLike[] | undefined)?.find(user => user.email === email && !user.last_sign_in_at);
  if (!ghost) return res.status(400).json({ error: error.message });

  const { error: updateUserError } = await admin.auth.admin.updateUserById(ghost.id, {
    password,
    user_metadata: { name: cleanName },
  });
  if (updateUserError) return res.status(400).json({ error: updateUserError.message });

  const { error: profileUpdateError } = await admin
    .from('profiles')
    .update({ name: cleanName, initials: initialsForName(cleanName) })
    .eq('id', ghost.id);
  if (profileUpdateError) return res.status(400).json({ error: profileUpdateError.message });

  const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({ email, password });
  if (signInErr) return res.status(400).json({ error: signInErr.message });
  return res.json({ user: signInData.user, session: signInData.session });
});
