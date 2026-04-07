import { useState, useEffect, useCallback, useRef } from 'react';
import { getComments, addComment as apiAddComment, deleteComment as apiDeleteComment } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: { name: string; initials: string };
}

export function useComments(taskId: string | null, projectId?: string | null) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const activeTaskId = taskId;
    const requestId = ++requestRef.current;

    if (!activeTaskId) {
      setComments([]);
      setLoaded(false);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const data = await getComments(activeTaskId) as Comment[];
      if (requestRef.current !== requestId) return;
      setComments(data);
      setLoaded(true);
      setError(null);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setComments([]);
      setLoaded(false);
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    requestRef.current += 1;
    setComments([]);
    setLoaded(false);
    setLoading(Boolean(taskId));
    setError(null);
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if ((event.type === 'comment_changed' || event.type === 'comment_deleted') && event.task_id === taskId) {
        void load();
      } else if (event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [taskId, projectId, load]);

  async function addComment(body: string) {
    if (!taskId) return;
    await apiAddComment(taskId, body);
    await load();
  }

  async function removeComment(commentId: string) {
    await apiDeleteComment(commentId);
    await load();
  }

  return { comments, loaded, loading, error, addComment, removeComment };
}
