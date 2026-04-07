import path from 'path';
import type { ProjectMember } from './authz-shared.js';
import { configuredProjectRoots, existingRealPath, pathInside } from './authz-path-utils.js';

export function normalizedMemberRoot(member: ProjectMember): string | null {
  if (!member.local_path) return null;
  const registeredRoot = existingRealPath(member.local_path);
  if (registeredRoot === path.parse(registeredRoot).root) return null;

  const roots = configuredProjectRoots();
  if (roots.length > 0 && !roots.some(root => pathInside(root, registeredRoot))) return null;

  return registeredRoot;
}

export function isLocalPathAllowed(member: ProjectMember, candidate: string): boolean {
  const registeredRoot = normalizedMemberRoot(member);
  return registeredRoot ? pathInside(registeredRoot, existingRealPath(candidate)) : false;
}
