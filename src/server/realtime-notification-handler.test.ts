import { describe, expect, it, vi, beforeEach } from 'vitest';

const broadcastMock = vi.hoisted(() => vi.fn());
const supabaseMock = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, single };
});

vi.mock('./realtime-listeners.js', () => ({
  broadcast: broadcastMock,
}));
vi.mock('./supabase.js', () => ({
  supabase: { from: supabaseMock.from },
}));

import { broadcastNotificationChange } from './realtime-notification-handler.js';

describe('broadcastNotificationChange', () => {
  beforeEach(() => {
    broadcastMock.mockClear();
    supabaseMock.from.mockClear();
    supabaseMock.single.mockReset();
  });

  it('resolves project_id via task lookup and broadcasts notification_changed', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-1' }, error: null });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n1', user_id: 'u1', task_id: 't1', type: 'mention' },
      old: null,
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('tasks');
    expect(broadcastMock).toHaveBeenCalledWith('proj-1', { type: 'notification_changed' });
  });

  it('resolves project_id via workstream lookup when task_id is absent', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-2' }, error: null });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n2', user_id: 'u1', workstream_id: 'w1', type: 'review_request' },
      old: null,
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('workstreams');
    expect(broadcastMock).toHaveBeenCalledWith('proj-2', { type: 'notification_changed' });
  });

  it('falls back to old record on DELETE', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: { project_id: 'proj-3' }, error: null });

    await broadcastNotificationChange({
      eventType: 'DELETE',
      new: {},
      old: { id: 'n3', user_id: 'u1', task_id: 't1' },
    });

    expect(broadcastMock).toHaveBeenCalledWith('proj-3', { type: 'notification_changed' });
  });

  it('does not broadcast when neither task_id nor workstream_id is present', async () => {
    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n4', user_id: 'u1', type: 'system' },
      old: null,
    });
    expect(supabaseMock.from).not.toHaveBeenCalled();
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('does not broadcast when the DB lookup fails', async () => {
    supabaseMock.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'not found' } });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n5', user_id: 'u1', task_id: 't1' },
      old: null,
    });
    expect(broadcastMock).not.toHaveBeenCalled();
  });

  it('logs when the DB lookup returns an unexpected error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.single.mockResolvedValueOnce({ data: null, error: { code: '500', message: 'network' } });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n6', user_id: 'u1', task_id: 't1' },
      old: null,
    });

    expect(broadcastMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('silently skips when the referenced task is missing (PGRST116)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    supabaseMock.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116', message: 'no rows returned' } });

    await broadcastNotificationChange({
      eventType: 'INSERT',
      new: { id: 'n7', user_id: 'u1', task_id: 't1' },
      old: null,
    });

    expect(broadcastMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
