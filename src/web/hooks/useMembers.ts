import { useState, useEffect, useCallback } from 'react';
import { getMembers } from '../lib/api';

export interface Member {
  id: string;
  name: string;
  initials: string;
  role: string;
}

export function useMembers(projectId: string | null) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const data = await getMembers(projectId);
      setMembers(data);
    } catch {
      // Silently handle — members list is optional
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return { members, loading, reload: load };
}
