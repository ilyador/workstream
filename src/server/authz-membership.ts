import type { Request, Response } from 'express';
import {
  asRecord,
  getUserId,
  isMissingRowError,
  type ProjectMember,
} from './authz-shared.js';
import { supabase } from './supabase.js';

export function projectMemberFromRow(value: unknown): ProjectMember | null {
  const record = asRecord(value);
  if (!record || typeof record.role !== 'string') return null;
  return {
    role: record.role,
    local_path: typeof record.local_path === 'string' ? record.local_path : null,
  };
}

export async function getProjectMember(userId: string, projectId: string): Promise<ProjectMember | null> {
  const { data, error } = await supabase
    .from('project_members')
    .select('role, local_path')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();
  if (error && !isMissingRowError(error)) {
    console.error(`[authz] Failed to load project membership for project ${projectId}:`, error.message);
  }
  return projectMemberFromRow(data);
}

export async function requireProjectMember(req: Request, res: Response, projectId: string): Promise<ProjectMember | null> {
  const member = await getProjectMember(getUserId(req), projectId);
  if (!member) {
    res.status(403).json({ error: 'Not a project member' });
    return null;
  }
  return member;
}

export async function requireProjectAdmin(req: Request, res: Response, projectId: string): Promise<ProjectMember | null> {
  const member = await requireProjectMember(req, res, projectId);
  if (!member) return null;
  if (member.role !== 'admin') {
    res.status(403).json({ error: 'Only project admins can perform this action' });
    return null;
  }
  return member;
}

export async function isProjectMember(projectId: string, userId: string): Promise<boolean> {
  return !!await getProjectMember(userId, projectId);
}
