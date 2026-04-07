import { asRecord, stringField } from '../authz.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MemberListItem = {
  id: unknown;
  name: unknown;
  email?: unknown;
  initials: unknown;
  role: unknown;
  pending?: boolean;
};

export function deriveNameFromEmail(email: string): { name: string; initials: string } {
  const name = email.split('@')[0] || email;
  const parts = name.split(/[.\-_]/).filter(Boolean);
  const first = parts[0]?.[0] || '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : '';
  const initials = (first + last).toUpperCase();
  return { name, initials };
}

export function memberListItem(row: unknown, includeEmail = false): MemberListItem {
  const record = asRecord(row) || {};
  const profile = asRecord(record.profiles) || {};
  return {
    id: record.user_id,
    name: profile.name || 'Unknown',
    email: includeEmail ? profile.email || '' : undefined,
    initials: profile.initials || '??',
    role: record.role,
  };
}

export function pendingInviteItem(invite: unknown): MemberListItem | null {
  const record = asRecord(invite);
  const email = record ? stringField(record, 'email') : null;
  if (!record || !email) return null;
  const { initials } = deriveNameFromEmail(email);
  return { id: record.id, name: email, email, initials, role: record.role, pending: true };
}
