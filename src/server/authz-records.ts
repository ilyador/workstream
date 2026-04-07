import type { Request, Response } from 'express';
import { requireProjectMember } from './authz-membership.js';
import {
  asRecord,
  isMissingRowError,
  stringField,
  type DbRecord,
  type ProjectAccess,
} from './authz-shared.js';
import { supabase } from './supabase.js';

async function requireRecordAccess<T extends DbRecord>(
  req: Request,
  res: Response,
  table: string,
  id: string,
  select = '*',
): Promise<ProjectAccess<T> | null> {
  const { data, error } = await supabase.from(table).select(select).eq('id', id).single();
  if (error) {
    if (isMissingRowError(error)) {
      res.status(404).json({ error: 'Record not found' });
      return null;
    }
    res.status(500).json({ error: error.message });
    return null;
  }
  const record = asRecord(data) as T | null;
  if (!record) {
    res.status(404).json({ error: 'Record not found' });
    return null;
  }

  const projectId = stringField(record, 'project_id');
  if (!projectId) {
    res.status(500).json({ error: 'Record is missing project_id' });
    return null;
  }

  const member = await requireProjectMember(req, res, projectId);
  if (!member) return null;
  return { record, projectId, member };
}

export async function requireTaskAccess(req: Request, res: Response, taskId: string, select = '*'): Promise<ProjectAccess | null> {
  return requireRecordAccess(req, res, 'tasks', taskId, select);
}

export async function requireJobAccess(req: Request, res: Response, jobId: string, select = '*'): Promise<ProjectAccess | null> {
  return requireRecordAccess(req, res, 'jobs', jobId, select);
}

export async function requireWorkstreamAccess(req: Request, res: Response, workstreamId: string, select = '*'): Promise<ProjectAccess | null> {
  return requireRecordAccess(req, res, 'workstreams', workstreamId, select);
}

export async function requireFlowAccess(req: Request, res: Response, flowId: string, select = '*'): Promise<ProjectAccess | null> {
  return requireRecordAccess(req, res, 'flows', flowId, select);
}

export async function requireCustomTypeAccess(req: Request, res: Response, customTypeId: string, select = '*'): Promise<ProjectAccess | null> {
  return requireRecordAccess(req, res, 'custom_task_types', customTypeId, select);
}
