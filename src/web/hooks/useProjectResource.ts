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
  const loaderRef = useRef(loader);
  const createInitialValueRef = useRef(createInitialValue);
  const getErrorMessageRef = useRef(getErrorMessage);

  useEffect(() => {
    loaderRef.current = loader;
    createInitialValueRef.current = createInitialValue;
    getErrorMessageRef.current = getErrorMessage;
  }, [loader, createInitialValue, getErrorMessage]);

  useEffect(() => {
    projectIdRef.current = projectId;
    requestRef.current += 1;
    setData(createInitialValueRef.current());
    setError(null);
    setReadyProjectId(null);
    setLoading(Boolean(projectId));
  }, [projectId]);

  const reload = useCallback(async () => {
    const activeProjectId = projectIdRef.current;
    const requestId = ++requestRef.current;

    if (!activeProjectId) {
      const empty = createInitialValueRef.current();
      setData(empty);
      setError(null);
      setReadyProjectId(null);
      setLoading(false);
      return empty;
    }

    setLoading(true);

    try {
      const result = await loaderRef.current(activeProjectId);
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
      const message = getErrorMessageRef.current
        ? getErrorMessageRef.current(err)
        : (err instanceof Error ? err.message : 'Failed to load');
      setError(message);
      return undefined;
    } finally {
      if (requestRef.current === requestId && projectIdRef.current === activeProjectId) {
        setLoading(false);
      }
    }
  }, []);

  return {
    data,
    setData,
    loading,
    error,
    ready: projectId === null ? true : readyProjectId === projectId,
    reload,
  };
}
