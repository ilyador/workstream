import type { Response } from 'express';
import { statSync } from 'fs';
import path from 'path';
import type { ProjectMember } from './authz-shared.js';
import { isLocalPathAllowed } from './authz-path-member.js';
import { configuredProjectRoots, containsSymlink, existingRealPath, expandHomePath, pathInside } from './authz-path-utils.js';

export { isLocalPathAllowed } from './authz-path-member.js';
export { existingRealPath } from './authz-path-utils.js';

export function normalizeRegisteredLocalPath(candidate: unknown): { path?: string; error?: string } {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return { error: 'local_path must be a non-empty string' };
  }

  const resolved = existingRealPath(candidate);
  if (resolved === path.parse(resolved).root) {
    return { error: 'local_path cannot be the filesystem root' };
  }

  try {
    if (!statSync(resolved).isDirectory()) return { error: 'local_path must be an existing directory' };
  } catch {
    return { error: 'local_path must be an existing directory' };
  }

  const roots = configuredProjectRoots();
  if (roots.length > 0 && !roots.some(root => pathInside(root, resolved))) {
    return { error: 'local_path is outside WORKSTREAM_ALLOWED_PROJECT_ROOTS' };
  }

  return { path: resolved };
}

export function requireAuthorizedLocalPath(
  res: Response,
  member: ProjectMember,
  candidate: unknown,
  label = 'localPath',
): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    res.status(400).json({ error: `${label} is required` });
    return null;
  }
  if (!member.local_path) {
    res.status(403).json({ error: 'Set your project local path before using filesystem-backed actions' });
    return null;
  }

  if (!isLocalPathAllowed(member, candidate)) {
    res.status(403).json({ error: `${label} is outside your registered project path` });
    return null;
  }

  const absoluteCandidate = path.resolve(expandHomePath(candidate.trim()));
  if (containsSymlink(absoluteCandidate)) {
    res.status(403).json({ error: `${label} must not contain symbolic links` });
    return null;
  }
  return existingRealPath(absoluteCandidate);
}

export function requireExactRegisteredLocalPath(
  res: Response,
  member: ProjectMember,
  candidate: unknown,
  label = 'localPath',
): string | null {
  const authorized = requireAuthorizedLocalPath(res, member, candidate, label);
  if (!authorized || !member.local_path) return authorized;

  if (existingRealPath(authorized) !== existingRealPath(member.local_path)) {
    res.status(403).json({ error: `${label} must match your registered project path` });
    return null;
  }

  return authorized;
}
