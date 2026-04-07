import type { DbRecord } from '../authz.js';

export function numericField(record: DbRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

export function lastEventId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
