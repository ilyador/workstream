import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase.js', () => ({ supabase: {} }));
vi.mock('../auth-middleware.js', () => ({ requireAuth: () => {} }));

const { enrichNotification } = await import('./notifications.js');
type NotificationJoinRow = Parameters<typeof enrichNotification>[0];

function makeRow(overrides: Partial<NotificationJoinRow> = {}): NotificationJoinRow {
  return {
    id: 'n1',
    type: 'mention',
    task_id: null,
    workstream_id: null,
    message: 'hello',
    read: false,
    created_at: '2026-04-11T00:00:00.000Z',
    tasks: null,
    workstreams: null,
    ...overrides,
  };
}

describe('enrichNotification', () => {
  it('resolves project_id via task join when task_id is present', () => {
    const result = enrichNotification(makeRow({
      task_id: 't1',
      tasks: { project_id: 'proj-1', workstreams: { status: 'open' } },
    }));
    expect(result.project_id).toBe('proj-1');
    expect(result.workstream_archived).toBe(false);
  });

  it('resolves project_id via direct workstream join for workstream-only notifications', () => {
    // review_request notifications have workstream_id but no task_id.
    const result = enrichNotification(makeRow({
      type: 'review_request',
      workstream_id: 'ws-1',
      workstreams: { project_id: 'proj-2', status: 'open' },
    }));
    expect(result.project_id).toBe('proj-2');
    expect(result.workstream_archived).toBe(false);
  });

  it('flags workstream_archived via task → workstream join', () => {
    const result = enrichNotification(makeRow({
      task_id: 't1',
      tasks: { project_id: 'proj-1', workstreams: { status: 'archived' } },
    }));
    expect(result.workstream_archived).toBe(true);
  });

  it('flags workstream_archived via direct workstream join', () => {
    const result = enrichNotification(makeRow({
      type: 'review_request',
      workstream_id: 'ws-1',
      workstreams: { project_id: 'proj-2', status: 'archived' },
    }));
    expect(result.workstream_archived).toBe(true);
  });

  it('prefers task → workstream status over direct workstream status when both present', () => {
    // Defensive: Supabase could return both joins if the notification has a
    // task_id that also has a workstream_id matching the notification's
    // workstream_id. Task's current workstream wins — that's where the user
    // needs to navigate.
    const result = enrichNotification(makeRow({
      task_id: 't1',
      workstream_id: 'ws-1',
      tasks: { project_id: 'proj-1', workstreams: { status: 'archived' } },
      workstreams: { project_id: 'proj-99', status: 'open' },
    }));
    expect(result.project_id).toBe('proj-1');
    expect(result.workstream_archived).toBe(true);
  });

  it('leaves project_id null and archived false when no join is available', () => {
    const result = enrichNotification(makeRow({ type: 'system' }));
    expect(result.project_id).toBeNull();
    expect(result.workstream_archived).toBe(false);
  });
});
