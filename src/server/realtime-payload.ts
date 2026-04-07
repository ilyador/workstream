export interface RealtimePayload {
  eventType: string;
  new: unknown;
  old: unknown;
}

export function projectRecord(payload: RealtimePayload): Record<string, unknown> {
  const newRec = payload.new as Record<string, unknown> | null;
  // On DELETE, Supabase sends payload.new as {} (empty object) — fall through to old
  if (newRec && typeof newRec === 'object' && Object.keys(newRec).length > 0) return newRec;
  return (payload.old as Record<string, unknown>) || {};
}

export function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
