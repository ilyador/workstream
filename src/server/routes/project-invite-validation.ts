import { EMAIL_RE } from './project-member-format.js';

const PROJECT_ROLES = new Set(['admin', 'dev', 'manager']);

export function normalizeInviteInput(email: unknown, role: unknown): { ok: true; email: string; role: string } | { ok: false; error: string } {
  if (typeof email !== 'string' || !email || typeof role !== 'string') return { ok: false, error: 'email and role required' };
  const inviteEmail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(inviteEmail)) return { ok: false, error: 'A valid email is required' };
  if (!PROJECT_ROLES.has(role)) return { ok: false, error: 'role must be admin, dev, or manager' };
  return { ok: true, email: inviteEmail, role };
}
