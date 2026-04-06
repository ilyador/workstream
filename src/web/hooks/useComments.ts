import { useState, useEffect, useCallback } from 'react';
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

  const load = useCallback(async () => {
    if (!taskId) return;
    const data = await getComments(taskId) as Comment[];
    setComments(data);
    setLoaded(true);
  }, [taskId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if ((event.type === 'comment_changed' || event.type === 'comment_deleted') && event.task_id === taskId) {
        load();
      } else if (event.type === 'full_sync') {
        load();
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

  return { comments, loaded, addComment, removeComment };
}
