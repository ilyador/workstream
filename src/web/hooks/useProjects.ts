import { useState, useEffect, useCallback } from 'react';
import { getProjects, createProject as apiCreateProject, updateProjectLocalPath } from '../lib/api';
import type { ProjectSummary, SupabaseConfig } from '../lib/api';

const STORAGE_KEY = 'workstream-current-project';

export function useProjects(userId: string | undefined) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(true);

  const switchProject = useCallback((id: string) => {
    setCurrentId(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const list = await getProjects();
      setProjects(list);
      if (!currentId || !list.find(p => p.id === currentId)) {
        if (list.length > 0) switchProject(list[0].id);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [currentId, switchProject]);

  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => {
      void loadProjects();
    });
  }, [userId, loadProjects]);

  async function createProject(name: string, supabaseConfig?: SupabaseConfig, localPath?: string): Promise<string> {
    const project = await apiCreateProject(name, supabaseConfig, localPath);
    await loadProjects();
    switchProject(project.id);
    return project.id;
  }

  async function updateLocalPath(projectId: string, localPath: string) {
    await updateProjectLocalPath(projectId, localPath);
    await loadProjects();
  }

  const current = projects.find(p => p.id === currentId) || null;

  return { projects, current, loading, switchProject, createProject, updateLocalPath };
}
