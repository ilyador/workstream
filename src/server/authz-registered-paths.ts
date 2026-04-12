import type { Request, Response } from 'express';
import { existingRealPath, isLocalPathAllowed } from './authz-paths.js';
import { projectMemberFromRow } from './authz-membership.js';
import { getUserId, type ProjectMember } from './authz-shared.js';
import { supabase } from './supabase.js';

async function getRequestMemberships(req: Request, res: Response): Promise<ProjectMember[] | null> {
  const { data, error } = await supabase
    .from('project_members')
    .select('role, local_path')
    .eq('user_id', getUserId(req));
  if (error) {
    console.error('[authz] Failed to load project memberships:', error.message);
    res.status(500).json({ error: 'Failed to load memberships' });
    return null;
  }
  return Array.isArray(data) ? data.map(projectMemberFromRow).filter((member): member is ProjectMember => !!member) : [];
}

function requireCandidatePath(res: Response, candidate: unknown): string | null {
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    res.status(400).json({ error: 'localPath is required' });
    return null;
  }
  return candidate;
}

export async function requireAnyRegisteredLocalPath(req: Request, res: Response, candidate: unknown): Promise<string | null> {
  const candidatePath = requireCandidatePath(res, candidate);
  if (!candidatePath) return null;
  const memberships = await getRequestMemberships(req, res);
  if (!memberships) return null;
  if (!memberships.some(member => isLocalPathAllowed(member, candidatePath))) {
    res.status(403).json({ error: 'localPath is outside your registered project paths' });
    return null;
  }
  return existingRealPath(candidatePath);
}

export async function requireAnyExactRegisteredLocalPath(req: Request, res: Response, candidate: unknown): Promise<string | null> {
  const candidatePath = requireCandidatePath(res, candidate);
  if (!candidatePath) return null;
  const memberships = await getRequestMemberships(req, res);
  if (!memberships) return null;
  const authorized = existingRealPath(candidatePath);
  if (!memberships.some(member => member.local_path && existingRealPath(member.local_path) === authorized && isLocalPathAllowed(member, authorized))) {
    res.status(403).json({ error: 'localPath must match one of your registered project paths' });
    return null;
  }

  return authorized;
}
