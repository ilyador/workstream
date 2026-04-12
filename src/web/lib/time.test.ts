import { describe, it, expect, vi, afterEach } from 'vitest';
import { elapsed, timeAgo } from './time';

describe('timeAgo', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns "just now" for timestamps within the last 60 seconds', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:01:00Z') });
    expect(timeAgo('2026-04-12T12:00:30Z')).toBe('just now');
  });

  it('returns minutes ago', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:05:00Z') });
    expect(timeAgo('2026-04-12T12:00:00Z')).toBe('5m ago');
  });

  it('returns hours ago', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T15:00:00Z') });
    expect(timeAgo('2026-04-12T12:00:00Z')).toBe('3h ago');
  });

  it('returns days ago', () => {
    vi.useFakeTimers({ now: new Date('2026-04-15T12:00:00Z') });
    expect(timeAgo('2026-04-12T12:00:00Z')).toBe('3d ago');
  });

  it('returns "just now" for future timestamps (mild clock skew)', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:00:00Z') });
    expect(timeAgo('2026-04-12T12:00:30Z')).toBe('just now');
  });

  it('returns empty string for invalid date input', () => {
    expect(timeAgo('not-a-date')).toBe('');
    expect(timeAgo('')).toBe('');
  });
});

describe('elapsed', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns seconds for short durations', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:00:45Z') });
    expect(elapsed('2026-04-12T12:00:00Z')).toBe('45s');
  });

  it('returns minutes for medium durations', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:03:00Z') });
    expect(elapsed('2026-04-12T12:00:00Z')).toBe('3m');
  });

  it('returns hours and minutes for long durations', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T13:12:00Z') });
    expect(elapsed('2026-04-12T12:00:00Z')).toBe('1h 12m');
  });

  it('returns 0s for exactly-now timestamps', () => {
    vi.useFakeTimers({ now: new Date('2026-04-12T12:00:00Z') });
    expect(elapsed('2026-04-12T12:00:00Z')).toBe('0s');
  });

  it('returns empty string for invalid date input', () => {
    expect(elapsed('garbage')).toBe('');
  });
});
