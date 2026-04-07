import { useState, useEffect, useCallback, useRef } from 'react';
import { getComments, addComment as apiAddComment, deleteComment as apiDeleteComment } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { name: string; initials: string };
}

interface CommentCacheEntry {
  comments: Comment[];
  loaded: boolean;
  error: string | null;
}

type CommentLoadOptions = { force?: boolean };

export interface CommentsData {
  comments: Comment[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  addComment: (body: string) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  reload: (options?: CommentLoadOptions) => Promise<Comment[] | void>;
}

const commentCache = new Map<string, CommentCacheEntry>();
const commentRequests = new Map<string, Promise<Comment[]>>();
const commentSubscribers = new Map<string, Set<(entry: CommentCacheEntry) => void>>();
const commentRequestVersions = new Map<string, number>();

export function clearCommentCacheForTests() {
  commentCache.clear();
  commentRequests.clear();
  commentSubscribers.clear();
  commentRequestVersions.clear();
}

export function useComments(taskId: string | null, projectId?: string | null): CommentsData {
  const cacheKey = taskId ? getCommentCacheKey(taskId, projectId) : null;
  const cached = cacheKey ? commentCache.get(cacheKey) : undefined;
  const [comments, setComments] = useState<Comment[]>(cached?.comments ?? []);
  const [loaded, setLoaded] = useState(cached?.loaded ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const requestRef = useRef(0);

  const load = useCallback(async (options?: CommentLoadOptions) => {
    const activeTaskId = taskId;
    const activeCacheKey = cacheKey;
    const requestId = ++requestRef.current;

    if (!activeTaskId || !activeCacheKey) {
      setComments([]);
      setLoaded(false);
      setLoading(false);
      setError(null);
      return;
    }

    const activeCached = commentCache.get(activeCacheKey);
    if (!options?.force && activeCached?.loaded) {
      setComments(activeCached.comments);
      setLoaded(true);
      setError(activeCached.error);
      setLoading(false);
      return activeCached.comments;
    }

    setLoading(!activeCached?.loaded);
    try {
      const data = await getCachedComments(activeCacheKey, activeTaskId, Boolean(options?.force));
      if (requestRef.current !== requestId) return;
      return data;
    } catch (err) {
      if (requestRef.current !== requestId) return;
      const message = err instanceof Error ? err.message : 'Failed to load comments';
      const fallbackCache = commentCache.get(activeCacheKey);
      writeCommentCache(activeCacheKey, fallbackCache?.loaded
        ? { ...fallbackCache, error: message }
        : { comments: [], loaded: false, error: message });
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [cacheKey, taskId]);

  useEffect(() => {
    requestRef.current += 1;
    const activeCached = cacheKey ? commentCache.get(cacheKey) : undefined;
    setComments(activeCached?.comments ?? []);
    setLoaded(activeCached?.loaded ?? false);
    setLoading(Boolean(taskId) && !activeCached?.loaded);
    setError(activeCached?.error ?? null);
    const unsubCache = cacheKey ? subscribeCommentCache(cacheKey, (entry) => {
      setComments(entry.comments);
      setLoaded(entry.loaded);
      setError(entry.error);
      setLoading(false);
    }) : undefined;
    void load();
    if (!projectId) return unsubCache;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if ((event.type === 'comment_changed' || event.type === 'comment_deleted') && event.task_id === taskId) {
        void load({ force: true });
      }
    });
    return () => {
      unsubCache?.();
      unsub();
    };
  }, [cacheKey, taskId, projectId, load]);

  async function addComment(body: string) {
    if (!taskId) return;
    await apiAddComment(taskId, body);
    await load({ force: true });
  }

  async function removeComment(commentId: string) {
    await apiDeleteComment(commentId);
    await load({ force: true });
  }

  return { comments, loaded, loading, error, addComment, removeComment, reload: load };
}

function getCommentCacheKey(taskId: string, projectId?: string | null) {
  return `${projectId || 'global'}:${taskId}`;
}

function writeCommentCache(cacheKey: string, entry: CommentCacheEntry) {
  commentCache.set(cacheKey, entry);
  const subscribers = commentSubscribers.get(cacheKey);
  if (!subscribers) return;
  for (const subscriber of subscribers) {
    subscriber(entry);
  }
}

function subscribeCommentCache(cacheKey: string, onChange: (entry: CommentCacheEntry) => void) {
  const subscribers = commentSubscribers.get(cacheKey) ?? new Set<(entry: CommentCacheEntry) => void>();
  subscribers.add(onChange);
  commentSubscribers.set(cacheKey, subscribers);
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0) {
      commentSubscribers.delete(cacheKey);
    }
  };
}

async function getCachedComments(cacheKey: string, taskId: string, force: boolean) {
  if (!force) {
    const cached = commentCache.get(cacheKey);
    if (cached?.loaded) return cached.comments;

    const inFlight = commentRequests.get(cacheKey);
    if (inFlight) return inFlight;
  }

  const request = getComments(taskId) as Promise<Comment[]>;
  const version = nextCommentRequestVersion(cacheKey);
  commentRequests.set(cacheKey, request);
  try {
    const comments = await request;
    if (commentRequestVersions.get(cacheKey) === version) {
      writeCommentCache(cacheKey, { comments, loaded: true, error: null });
    }
    return comments;
  } catch (err) {
    if (commentRequestVersions.get(cacheKey) !== version) {
      return commentCache.get(cacheKey)?.comments ?? [];
    }
    throw err;
  } finally {
    if (commentRequests.get(cacheKey) === request) {
      commentRequests.delete(cacheKey);
    }
  }
}

function nextCommentRequestVersion(cacheKey: string) {
  const version = (commentRequestVersions.get(cacheKey) ?? 0) + 1;
  commentRequestVersions.set(cacheKey, version);
  return version;
}
