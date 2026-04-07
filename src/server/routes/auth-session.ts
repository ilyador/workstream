import { Router } from 'express';
import { adminClient, bearerToken, normalizedEmail, userClient } from './auth-utils.js';

export const authSessionRouter = Router();

authSessionRouter.post('/api/auth/signin', async (req, res) => {
  const { password } = req.body;
  const email = normalizedEmail(req.body.email);

  if (!email) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const admin = adminClient();
  const { data, error } = await admin.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

authSessionRouter.post('/api/auth/signout', async (req, res) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'No token' });
  const client = userClient(token);
  const { error } = await client.auth.signOut();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

authSessionRouter.get('/api/auth/me', async (req, res) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) return res.status(401).json({ error: 'No token' });

  const admin = adminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile, error: profileError } = await admin.from('profiles').select('*').eq('id', user.id).single();
  if (profileError) return res.status(500).json({ error: profileError.message });
  res.json({ user, profile });
});

authSessionRouter.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (typeof refresh_token !== 'string' || refresh_token.length === 0) {
    return res.status(400).json({ error: 'refresh_token is required' });
  }
  const admin = adminClient();
  const { data, error } = await admin.auth.refreshSession({ refresh_token });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ session: data.session, user: data.user });
});
