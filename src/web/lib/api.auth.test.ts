import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('api auth token handling', () => {
  const storageMap = new Map<string, string>();

  beforeEach(() => {
    vi.resetModules();
    storageMap.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, value: string) => { storageMap.set(key, value); },
      removeItem: (key: string) => { storageMap.delete(key); },
      clear: () => { storageMap.clear(); },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resyncs the access token from localStorage before authenticated API requests', async () => {
    const { continueJob } = await import('./api');
    storageMap.set('workstream-token', 'late-token');
    storageMap.set('workstream-refresh', 'late-refresh');

    await continueJob('job-1');

    expect(fetch).toHaveBeenCalledWith('/api/jobs/job-1/continue', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer late-token',
      }),
    }));
  });

  it('resyncs the access token when getToken is called', async () => {
    const { getToken } = await import('./api');
    storageMap.set('workstream-token', 'restored-token');

    expect(getToken()).toBe('restored-token');
  });
});
