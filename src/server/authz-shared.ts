import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

export interface ProjectMember {
  role: string;
  local_path: string | null;
}

export type DbRecord = Record<string, unknown>;

export interface ProjectAccess<T extends DbRecord = DbRecord> {
  record: T;
  projectId: string;
  member: ProjectMember;
}

export function getUserId(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

export function asRecord(value: unknown): DbRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DbRecord : null;
}

export function stringField(record: DbRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function isMissingRowError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST116';
}
