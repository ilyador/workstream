import { describe, expect, it } from 'vitest';
import type { NotificationRecord, WorkstreamRecord } from './api';
import { buildReviewItems } from './project-list-view-models';

function makeWorkstream(overrides: Partial<WorkstreamRecord> = {}): WorkstreamRecord {
  return {
    id: 'ws-1',
    project_id: 'project-1',
    name: 'Review checkout flow',
    description: '',
    has_code: true,
    status: 'done',
    position: 1,
    pr_url: null,
    reviewer_id: null,
    created_at: '2026-04-07T00:00:00.000Z',
    ...overrides,
  };
}

function makeReviewRequest(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: 'notification-1',
    type: 'review_request',
    task_id: null,
    workstream_id: 'ws-1',
    message: 'You were assigned to review "Review checkout flow"',
    read: false,
    created_at: '2026-04-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildReviewItems', () => {
  it('includes workstreams assigned directly to the current user', () => {
    const items = buildReviewItems(
      [makeWorkstream({ reviewer_id: 'user-1' })],
      [],
      [],
      {},
      'user-1',
    );

    expect(items).toEqual([
      {
        id: 'ws-ws-1',
        label: 'Review checkout flow',
        sublabel: 'Workstream review',
        workstreamId: 'ws-1',
      },
    ]);
  });

  it('includes review-request workstreams when reviewer data is missing from the record', () => {
    const items = buildReviewItems(
      [makeWorkstream()],
      [],
      [],
      {},
      'user-1',
      [makeReviewRequest()],
    );

    expect(items.map(item => item.workstreamId)).toEqual(['ws-1']);
  });

  it('does not duplicate assigned workstreams with matching review-request notifications', () => {
    const items = buildReviewItems(
      [makeWorkstream({ reviewer_id: 'user-1' })],
      [],
      [],
      {},
      'user-1',
      [makeReviewRequest()],
    );

    expect(items.map(item => item.workstreamId)).toEqual(['ws-1']);
  });

  it('ignores stale review-request notifications when the workstream is assigned to someone else', () => {
    const items = buildReviewItems(
      [makeWorkstream({ reviewer_id: 'user-2' })],
      [],
      [],
      {},
      'user-1',
      [makeReviewRequest()],
    );

    expect(items).toEqual([]);
  });

  it('omits merged and archived workstreams from review items', () => {
    const items = buildReviewItems(
      [
        makeWorkstream({ id: 'merged-ws', status: 'merged', reviewer_id: 'user-1' }),
        makeWorkstream({ id: 'archived-ws', status: 'archived', reviewer_id: 'user-1' }),
      ],
      [],
      [],
      {},
      'user-1',
    );

    expect(items).toEqual([]);
  });
});
