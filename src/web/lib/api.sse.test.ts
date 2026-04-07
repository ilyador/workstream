import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  listeners = new Map<string, Set<Listener>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  readyState = MockEventSource.CONNECTING;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.closed = true;
    this.readyState = MockEventSource.CLOSED;
  }

  emit(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent);
    }
  }

  triggerError(): void {
    this.onerror?.();
  }

  triggerOpen(): void {
    this.readyState = MockEventSource.OPEN;
    this.onopen?.();
  }

  failClosed(): void {
    this.readyState = MockEventSource.CLOSED;
    this.onerror?.();
  }
}

describe('subscribeToChanges SSE reconnects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
      clear: () => { storage.clear(); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('replaces a project EventSource after repeated errors', async () => {
    const { subscribeToChanges } = await import('./api');
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToChanges('project-1', onUpdate);

    const first = MockEventSource.instances[0];
    for (let i = 0; i < 5; i++) first.triggerError();

    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);

    const second = MockEventSource.instances[1];
    expect(second).toBeDefined();
    expect(second.closed).toBe(false);

    second.triggerOpen();
    expect(onUpdate).toHaveBeenCalledWith({ type: 'full_sync' });

    second.emit('message', { type: 'task_changed' });
    expect(onUpdate).toHaveBeenCalledWith({ type: 'task_changed' });

    unsubscribe();
    expect(second.closed).toBe(true);
  });

  it('cancels a pending reconnect when unsubscribed', async () => {
    const { subscribeToChanges } = await import('./api');
    const unsubscribe = subscribeToChanges('project-1', vi.fn());

    const first = MockEventSource.instances[0];
    for (let i = 0; i < 5; i++) first.triggerError();
    unsubscribe();
    vi.advanceTimersByTime(1000);

    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('replaces a project EventSource after a permanent closed error', async () => {
    const { subscribeToChanges } = await import('./api');
    const unsubscribe = subscribeToChanges('project-1', vi.fn());

    const first = MockEventSource.instances[0];
    first.failClosed();
    expect(first.closed).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(MockEventSource.instances).toHaveLength(2);

    unsubscribe();
  });

  it('full-syncs after a native EventSource reconnect', async () => {
    const { subscribeToChanges } = await import('./api');
    const onUpdate = vi.fn();
    const unsubscribe = subscribeToChanges('project-1', onUpdate);

    const source = MockEventSource.instances[0];
    source.triggerOpen();
    expect(onUpdate).not.toHaveBeenCalled();

    source.triggerError();
    source.triggerOpen();
    expect(onUpdate).toHaveBeenCalledWith({ type: 'full_sync' });

    unsubscribe();
  });
});
