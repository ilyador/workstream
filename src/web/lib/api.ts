const BASE = '';

// Session token management
let accessToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('codesync-token') : null;
let refreshToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('codesync-refresh') : null;

export function setSession(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('codesync-token', access);
  localStorage.setItem('codesync-refresh', refresh);
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('codesync-token');
  localStorage.removeItem('codesync-refresh');
}

export function getToken() { return accessToken; }

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      setSession(data.session.access_token, data.session.refresh_token);
      headers['Authorization'] = `Bearer ${data.session.access_token}`;
      const retry = await fetch(`${BASE}${path}`, { ...options, headers });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ error: retry.statusText }));
        throw new Error(err.error || 'Request failed after token refresh');
      }
      if (retry.status === 204) return { ok: true };
      return retry.json();
    }
    clearSession();
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  if (res.status === 204) return { ok: true };
  return res.json();
}

// --- Auth ---
export async function signUp(email: string, password: string, name: string) {
  const data = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  if (data.session) setSession(data.session.access_token, data.session.refresh_token);
  return data;
}

export async function signIn(email: string, password: string) {
  const data = await apiFetch('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.session) setSession(data.session.access_token, data.session.refresh_token);
  return data;
}

export async function signOut() {
  await apiFetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
  clearSession();
}

export async function getMe() {
  return apiFetch('/api/auth/me');
}

// --- Onboarding ---
export async function fetchOnboarding(localPath?: string) {
  const params = localPath ? `?localPath=${encodeURIComponent(localPath)}` : '';
  return apiFetch(`/api/onboarding${params}`);
}

// --- Projects ---
export async function getProjects() {
  return apiFetch('/api/projects') as Promise<{ id: string; name: string; role: string }[]>;
}

export type SupabaseConfig = {
  mode: 'local' | 'cloud';
  url?: string;
  serviceRoleKey?: string;
};

export async function createProject(name: string, supabaseConfig?: SupabaseConfig, localPath?: string) {
  return apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, supabase_config: supabaseConfig, local_path: localPath }),
  });
}

export async function updateProjectLocalPath(projectId: string, localPath: string) {
  return apiFetch(`/api/projects/${projectId}/local-path`, {
    method: 'PATCH',
    body: JSON.stringify({ local_path: localPath }),
  });
}

export async function checkHealth(): Promise<{ ok: boolean }> {
  return apiFetch('/api/health');
}

// --- Members ---
export async function getMembers(projectId: string) {
  return apiFetch(`/api/members?project_id=${projectId}`) as Promise<{ id: string; name: string; initials: string; role: string }[]>;
}

// --- Milestones ---
export async function getMilestones(projectId: string) {
  return apiFetch(`/api/milestones?project_id=${projectId}`);
}

export async function createMilestone(projectId: string, name: string, deadline?: string) {
  return apiFetch('/api/milestones', { method: 'POST', body: JSON.stringify({ project_id: projectId, name, deadline }) });
}

// --- Tasks ---
export async function getTasks(projectId: string) {
  return apiFetch(`/api/tasks?project_id=${projectId}`);
}

export async function createTask(data: {
  project_id: string;
  title: string;
  description?: string;
  type?: string;
  mode?: string;
  effort?: string;
  multiagent?: string;
  assignee?: string | null;
  blocked_by?: string[];
  images?: string[];
  milestone_id?: string | null;
}) {
  return apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateTask(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteTask(id: string) {
  return apiFetch(`/api/tasks/${id}`, { method: 'DELETE' });
}

// --- Jobs ---
export async function getJobs(projectId: string) {
  return apiFetch(`/api/jobs?project_id=${projectId}`);
}

export async function runTaskApi(taskId: string, projectId: string, localPath: string) {
  return apiFetch('/api/run', { method: 'POST', body: JSON.stringify({ taskId, projectId, localPath }) });
}

export async function replyToJob(jobId: string, answer: string, localPath: string) {
  return apiFetch(`/api/jobs/${jobId}/reply`, { method: 'POST', body: JSON.stringify({ answer, localPath }) });
}

export async function approveJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/approve`, { method: 'POST' });
}

export async function rejectJob(jobId: string, note: string) {
  return apiFetch(`/api/jobs/${jobId}/reject`, { method: 'POST', body: JSON.stringify({ note }) });
}

export async function terminateJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/terminate`, { method: 'POST' });
}

// --- Git ---
export async function gitCommit(jobId: string, localPath: string) {
  return apiFetch('/api/git/commit', { method: 'POST', body: JSON.stringify({ jobId, localPath }) });
}

export async function gitPush(localPath: string) {
  return apiFetch('/api/git/push', { method: 'POST', body: JSON.stringify({ localPath }) });
}

export async function gitPr(jobId: string, localPath: string) {
  return apiFetch('/api/git/pr', { method: 'POST', body: JSON.stringify({ jobId, localPath }) });
}

// --- Comments ---
export async function getComments(taskId: string) {
  return apiFetch(`/api/comments?task_id=${taskId}`);
}

export async function addComment(taskId: string, body: string) {
  return apiFetch('/api/comments', { method: 'POST', body: JSON.stringify({ task_id: taskId, body }) });
}

// --- Notifications ---
export async function getNotifications() {
  return apiFetch('/api/notifications');
}

export async function markNotificationRead(id: string) {
  return apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead() {
  return apiFetch('/api/notifications/read-all', { method: 'POST' });
}

// --- Skills ---
export interface SkillInfo {
  name: string;
  description: string;
  source: string;
}

export async function getSkills(localPath?: string): Promise<SkillInfo[]> {
  const params = localPath ? `?local_path=${encodeURIComponent(localPath)}` : '';
  return apiFetch(`/api/skills${params}`) as Promise<SkillInfo[]>;
}

// --- SSE: Job log stream (token passed as query param since EventSource can't set headers) ---
export type ConnectionState = 'connecting' | 'open' | 'error';

export function subscribeToJob(jobId: string, handlers: {
  onLog?: (text: string) => void;
  onPhaseStart?: (phase: string, attempt: number) => void;
  onPhaseComplete?: (phase: string, output: any) => void;
  onPause?: (question: string) => void;
  onReview?: (result: any) => void;
  onDone?: () => void;
  onFail?: (error: string) => void;
  onConnectionChange?: (state: ConnectionState) => void;
}): () => void {
  const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';
  const source = new EventSource(`${BASE}/api/jobs/${jobId}/events${tokenParam}`);

  handlers.onConnectionChange?.('connecting');

  source.onopen = () => {
    handlers.onConnectionChange?.('open');
  };

  source.onerror = () => {
    // EventSource will auto-reconnect; surface state so UI can show it
    if (source.readyState === EventSource.CONNECTING) {
      handlers.onConnectionChange?.('connecting');
    } else if (source.readyState === EventSource.CLOSED) {
      handlers.onConnectionChange?.('error');
    }
  };

  source.addEventListener('log', (e) => handlers.onLog?.(JSON.parse(e.data).text));
  source.addEventListener('phase_start', (e) => { const d = JSON.parse(e.data); handlers.onPhaseStart?.(d.phase, d.attempt); });
  source.addEventListener('phase_complete', (e) => { const d = JSON.parse(e.data); handlers.onPhaseComplete?.(d.phase, d.output); });
  source.addEventListener('paused', (e) => handlers.onPause?.(JSON.parse(e.data).question));
  source.addEventListener('review', (e) => handlers.onReview?.(JSON.parse(e.data)));
  source.addEventListener('done', () => handlers.onDone?.());
  source.addEventListener('failed', (e) => handlers.onFail?.(JSON.parse(e.data).error));
  return () => source.close();
}

// --- SSE: Realtime project changes ---
export function subscribeToChanges(projectId: string, onUpdate: (data: any) => void): () => void {
  const tokenParam = accessToken ? `?token=${encodeURIComponent(accessToken)}` : '';
  const source = new EventSource(`${BASE}/api/changes?project_id=${projectId}${tokenParam}`);
  source.addEventListener('message', (e) => onUpdate(JSON.parse(e.data)));
  return () => source.close();
}
