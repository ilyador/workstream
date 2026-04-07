import { stringField, type DbRecord } from '../authz.js';

export function numericField(record: DbRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

export function booleanField(record: DbRecord, key: string): boolean {
  return record[key] === true;
}

export function flowTask(task: DbRecord): { flow_id?: string; type: string } | null {
  const type = stringField(task, 'type');
  if (!type) return null;
  return { type, flow_id: stringField(task, 'flow_id') ?? undefined };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
