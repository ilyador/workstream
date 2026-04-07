export interface RealtimePayload {
  eventType: string;
  new: unknown;
  old: unknown;
}

export function projectRecord(payload: RealtimePayload): Record<string, unknown> {
  return (payload.new as Record<string, unknown>) || (payload.old as Record<string, unknown>);
}

export function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
