import { useState, useEffect, useCallback } from 'react';
import { getArtifacts, uploadArtifact as apiUpload, deleteArtifact as apiDelete, type Artifact } from '../lib/api';

export function useArtifacts(taskId: string | null) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      const data = await getArtifacts(taskId);
      setArtifacts(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [taskId]);

  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    if (!taskId) return;
    await apiUpload(taskId, file);
    await load();
  }

  async function remove(artifactId: string) {
    await apiDelete(artifactId);
    await load();
  }

  return { artifacts, loading, upload, remove, reload: load };
}
