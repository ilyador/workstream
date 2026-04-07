import { useState, useEffect, useCallback, useRef } from 'react';
import { getArtifacts, uploadArtifact as apiUpload, deleteArtifact as apiDelete, type Artifact } from '../lib/api';
import { subscribeProjectEvents } from './useProjectEvents';

export function useArtifacts(taskId: string | null, projectId?: string | null) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const activeTaskId = taskId;
    const requestId = ++requestRef.current;

    if (!activeTaskId) {
      setArtifacts([]);
      setLoading(false);
      setLoaded(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const data = await getArtifacts(activeTaskId);
      if (requestRef.current !== requestId) return;
      setArtifacts(data);
      setLoaded(true);
      setError(null);
    } catch (err) {
      if (requestRef.current !== requestId) return;
      setArtifacts([]);
      setLoaded(false);
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    requestRef.current += 1;
    setArtifacts([]);
    setLoading(Boolean(taskId));
    setLoaded(false);
    setError(null);
    void load();
    if (!projectId) return;
    const unsub = subscribeProjectEvents(projectId, (event) => {
      if ((event.type === 'artifact_changed' || event.type === 'artifact_deleted') && event.task_id === taskId) {
        void load();
      } else if (event.type === 'full_sync') {
        void load();
      }
    });
    return unsub;
  }, [taskId, projectId, load]);

  async function upload(file: File) {
    if (!taskId) return;
    await apiUpload(taskId, file);
    await load();
  }

  async function remove(artifactId: string) {
    await apiDelete(artifactId);
    await load();
  }

  return { artifacts, loading, loaded, error, upload, remove, reload: load };
}
