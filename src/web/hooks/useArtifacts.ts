import { useState, useEffect, useCallback, useRef } from 'react';
import { getArtifacts, uploadArtifact as apiUpload, deleteArtifact as apiDelete, type Artifact } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

interface ArtifactCacheEntry {
  artifacts: Artifact[];
  loaded: boolean;
  error: string | null;
}

type ArtifactLoadOptions = { force?: boolean };

export interface ArtifactsData {
  artifacts: Artifact[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
  upload: (file: File) => Promise<void>;
  remove: (artifactId: string) => Promise<void>;
  reload: (options?: ArtifactLoadOptions) => Promise<Artifact[] | void>;
}

const artifactCache = new Map<string, ArtifactCacheEntry>();
const artifactRequests = new Map<string, Promise<Artifact[]>>();
const artifactSubscribers = new Map<string, Set<(entry: ArtifactCacheEntry) => void>>();
const artifactRequestVersions = new Map<string, number>();

export function clearArtifactCacheForTests() {
  artifactCache.clear();
  artifactRequests.clear();
  artifactSubscribers.clear();
  artifactRequestVersions.clear();
}

export function useArtifacts(taskId: string | null, projectId?: string | null): ArtifactsData {
  const cacheKey = taskId ? getArtifactCacheKey(taskId, projectId) : null;
  const cached = cacheKey ? artifactCache.get(cacheKey) : undefined;
  const [artifacts, setArtifacts] = useState<Artifact[]>(cached?.artifacts ?? []);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(cached?.loaded ?? false);
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const requestRef = useRef(0);

  const load = useCallback(async (options?: ArtifactLoadOptions) => {
    const activeTaskId = taskId;
    const activeCacheKey = cacheKey;
    const requestId = ++requestRef.current;

    if (!activeTaskId || !activeCacheKey) {
      setArtifacts([]);
      setLoading(false);
      setLoaded(false);
      setError(null);
      return;
    }

    const activeCached = artifactCache.get(activeCacheKey);
    if (!options?.force && activeCached?.loaded) {
      setArtifacts(activeCached.artifacts);
      setLoaded(true);
      setError(activeCached.error);
      setLoading(false);
      return activeCached.artifacts;
    }

    setLoading(!activeCached?.loaded);
    try {
      const data = await getCachedArtifacts(activeCacheKey, activeTaskId, Boolean(options?.force));
      if (requestRef.current !== requestId) return;
      return data;
    } catch (err) {
      if (requestRef.current !== requestId) return;
      const message = err instanceof Error ? err.message : 'Failed to load artifacts';
      const fallbackCache = artifactCache.get(activeCacheKey);
      writeArtifactCache(activeCacheKey, fallbackCache?.loaded
        ? { ...fallbackCache, error: message }
        : { artifacts: [], loaded: false, error: message });
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [cacheKey, taskId]);

  useEffect(() => {
    requestRef.current += 1;
    const activeCached = cacheKey ? artifactCache.get(cacheKey) : undefined;
    setArtifacts(activeCached?.artifacts ?? []);
    setLoading(Boolean(taskId) && !activeCached?.loaded);
    setLoaded(activeCached?.loaded ?? false);
    setError(activeCached?.error ?? null);
    const unsubCache = cacheKey ? subscribeArtifactCache(cacheKey, (entry) => {
      setArtifacts(entry.artifacts);
      setLoaded(entry.loaded);
      setError(entry.error);
      setLoading(false);
    }) : undefined;
    void load();
    if (!projectId) return unsubCache;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if ((event.type === 'artifact_changed' || event.type === 'artifact_deleted') && event.task_id === taskId) {
        void load({ force: true });
      }
    });
    return () => {
      unsubCache?.();
      unsub();
    };
  }, [cacheKey, taskId, projectId, load]);

  async function upload(file: File) {
    if (!taskId) return;
    await apiUpload(taskId, file);
    await load({ force: true });
  }

  async function remove(artifactId: string) {
    await apiDelete(artifactId);
    await load({ force: true });
  }

  return { artifacts, loading, loaded, error, upload, remove, reload: load };
}

function getArtifactCacheKey(taskId: string, projectId?: string | null) {
  return `${projectId || 'global'}:${taskId}`;
}

function writeArtifactCache(cacheKey: string, entry: ArtifactCacheEntry) {
  artifactCache.set(cacheKey, entry);
  const subscribers = artifactSubscribers.get(cacheKey);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    subscriber(entry);
  }
}

function subscribeArtifactCache(cacheKey: string, onChange: (entry: ArtifactCacheEntry) => void) {
  const subscribers = artifactSubscribers.get(cacheKey) ?? new Set<(entry: ArtifactCacheEntry) => void>();
  subscribers.add(onChange);
  artifactSubscribers.set(cacheKey, subscribers);
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0) {
      artifactSubscribers.delete(cacheKey);
    }
  };
}

async function getCachedArtifacts(cacheKey: string, taskId: string, force: boolean) {
  if (!force) {
    const cached = artifactCache.get(cacheKey);
    if (cached?.loaded) return cached.artifacts;

    const inFlight = artifactRequests.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const request = getArtifacts(taskId);
  const version = nextArtifactRequestVersion(cacheKey);
  artifactRequests.set(cacheKey, request);
  try {
    const artifacts = await request;
    if (artifactRequestVersions.get(cacheKey) === version) {
      writeArtifactCache(cacheKey, { artifacts, loaded: true, error: null });
    }
    return artifacts;
  } catch (err) {
    if (artifactRequestVersions.get(cacheKey) !== version) {
      return artifactCache.get(cacheKey)?.artifacts ?? [];
    }
    throw err;
  } finally {
    if (artifactRequests.get(cacheKey) === request) {
      artifactRequests.delete(cacheKey);
    }
  }
}

function nextArtifactRequestVersion(cacheKey: string) {
  const version = (artifactRequestVersions.get(cacheKey) ?? 0) + 1;
  artifactRequestVersions.set(cacheKey, version);
  return version;
}
