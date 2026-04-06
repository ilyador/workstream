import { useState, useRef, useEffect, useCallback } from 'react';

export interface ProjectResourceOptions<T> {
  createInitialValue: () => T;
  getErrorMessage?: (err: unknown) => string | null;
}

export interface ProjectResourceState<T> {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  loading: boolean;
  error: string | null;
  ready: boolean;
  reload: () => Promise<T | undefined>;
}

export function useProjectResource<T>(
  projectId: string | null,
  loader: (projectId: string) => Promise<T>,
  { createInitialValue, getErrorMessage }: ProjectResourceOptions<T>,
): ProjectResourceState<T> {
  const [data, setData] = useState<T>(() => createInitialValue());
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  const [readyProjectId, setReadyProjectId] = useState<string | null>(null);
  const requestRef = useRef(0);
  const projectIdRef = useRef<string | null>(projectId);

  useEffect(() => {
    projectIdRef.current = projectId;
    requestRef.current += 1;
    setData(createInitialValue());
    setError(null);
    setReadyProjectId(null);
    setLoading(Boolean(projectId));
  }, [projectId, createInitialValue]);

  const reload = useCallback(async () => {
    const activeProjectId = projectIdRef.current;
    const requestId = ++requestRef.current;

    if (!activeProjectId) {
      const empty = createInitialValue();
      setData(empty);
      setError(null);
      setReadyProjectId(null);
      setLoading(false);
      return empty;
    }

    setLoading(true);

    try {
      const result = await loader(activeProjectId);
      if (requestRef.current !== requestId || projectIdRef.current !== activeProjectId) {
        return undefined;
      }
      setData(result);
      setError(null);
      setReadyProjectId(activeProjectId);
      return result;
    } catch (err) {
      if (requestRef.current !== requestId || projectIdRef.current !== activeProjectId) {
        return undefined;
      }
      setError(getErrorMessage ? getErrorMessage(err) : (err instanceof Error ? err.message : 'Failed to load'));
      return undefined;
    } finally {
      if (requestRef.current === requestId && projectIdRef.current === activeProjectId) {
        setLoading(false);
      }
    }
  }, [createInitialValue, getErrorMessage, loader]);

  return {
    data,
    setData,
    loading,
    error,
    ready: projectId === null ? true : readyProjectId === projectId,
    reload,
  };
}
