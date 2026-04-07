import type { Request, Response, NextFunction } from 'express';
import { supabase } from './supabase.js';
import type { AuthenticatedRequest } from './authz.js';

/**
 * Extracts and verifies the JWT from the Authorization header using Supabase auth.
 * On success, sets req.userId to the authenticated user's ID.
 * On failure, responds with 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = req.headers.authorization?.replace('Bearer ', '') || queryToken;
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  (req as AuthenticatedRequest).userId = user.id;
  next();
}
