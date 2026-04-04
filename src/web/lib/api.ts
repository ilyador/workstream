const BASE = '';

// Session token management
let accessToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('workstream-token') : null;
let refreshToken: string | null = typeof localStorage !== 'undefined' ? localStorage.getItem('workstream-refresh') : null;

export function setSession(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('workstream-token', access);
  localStorage.setItem('workstream-refresh', refresh);
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('workstream-token');
  localStorage.removeItem('workstream-refresh');
}

export function getToken() { return accessToken; }

// Serialize token refresh to prevent parallel requests from racing
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session.access_token, data.session.refresh_token);
        return true;
      }
      clearSession();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function parseResponse(res: Response): Promise<any> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof err?.error === 'string' ? err.error
      : typeof err?.message === 'string' ? err.message
      : typeof err?.msg === 'string' ? err.msg
      : res.statusText || 'Request failed';
    throw new Error(msg);
  }
  if (res.status === 204) return { ok: true };
  return res.json();
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshSession();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      return parseResponse(await fetch(`${BASE}${path}`, { ...options, headers }));
    }
    clearSession();
    throw new Error('Session expired');
  }

  return parseResponse(res);
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
  return apiFetch(`/api/members?project_id=${projectId}`) as Promise<{ id: string; name: string; initials: string; role: string; email?: string; pending?: boolean }[]>;
}

// --- Workstreams ---
export async function getWorkstreams(projectId: string) {
  return apiFetch(`/api/workstreams?project_id=${projectId}`);
}

export async function createWorkstream(projectId: string, name: string, description?: string, has_code?: boolean) {
  return apiFetch('/api/workstreams', { method: 'POST', body: JSON.stringify({ project_id: projectId, name, description, has_code }) });
}

export async function updateWorkstream(id: string, data: Record<string, unknown>) {
  return apiFetch(`/api/workstreams/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteWorkstream(id: string) {
  return apiFetch(`/api/workstreams/${id}`, { method: 'DELETE' });
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
  flow_id?: string | null;
  auto_continue?: boolean;
  images?: string[];
  workstream_id?: string | null;
  priority?: string;
  chaining?: string;
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

export async function runTaskApi(taskId: string, projectId: string, localPath: string, autoContinue?: boolean) {
  return apiFetch('/api/run', { method: 'POST', body: JSON.stringify({ taskId, projectId, localPath, autoContinue }) });
}

export async function replyToJob(jobId: string, answer: string, localPath: string) {
  return apiFetch(`/api/jobs/${jobId}/reply`, { method: 'POST', body: JSON.stringify({ answer, localPath }) });
}

export async function approveJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/approve`, { method: 'POST' });
}

export async function rejectJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/reject`, { method: 'POST' });
}

export async function reworkJob(jobId: string, note: string, projectId: string, localPath: string) {
  return apiFetch(`/api/jobs/${jobId}/rework`, { method: 'POST', body: JSON.stringify({ note, projectId, localPath }) });
}

export async function terminateJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/terminate`, { method: 'POST' });
}

export async function continueJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}/continue`, { method: 'POST' });
}

export async function deleteJob(jobId: string) {
  return apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
}

export async function revertJob(jobId: string, localPath: string) {
  return apiFetch(`/api/jobs/${jobId}/revert`, {
    method: 'POST',
    body: JSON.stringify({ localPath }),
  });
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

export async function createWorkstreamPr(workstreamId: string, localPath: string) {
  return apiFetch('/api/git/workstream-pr', { method: 'POST', body: JSON.stringify({ workstreamId, localPath }) });
}

export async function reviewAndCreatePr(workstreamId: string, localPath: string) {
  return apiFetch('/api/git/workstream-review-pr', { method: 'POST', body: JSON.stringify({ workstreamId, localPath }) });
}

// --- Invites / member management ---
export async function inviteMember(projectId: string, email: string, role: string) {
  return apiFetch(`/api/projects/${projectId}/invite`, { method: 'POST', body: JSON.stringify({ email, role }) });
}

export async function removeMember(projectId: string, userId: string) {
  return apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
}

// --- Comments ---
export async function getCommentCounts(projectId: string): Promise<Record<string, number>> {
  return apiFetch(`/api/comment-counts?project_id=${projectId}`);
}

export async function getComments(taskId: string) {
  return apiFetch(`/api/comments?task_id=${taskId}`);
}

export async function addComment(taskId: string, body: string) {
  return apiFetch('/api/comments', { method: 'POST', body: JSON.stringify({ task_id: taskId, body }) });
}

export async function deleteComment(commentId: string) {
  return apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
}

// --- Artifacts ---
export interface Artifact {
  id: string;
  task_id: string;
  job_id: string | null;
  phase: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  repo_path: string | null;
  url: string;
  created_at: string;
}

function withAuthToken(url: string): string {
  const token = getToken();
  return (token && url.startsWith('/api/')) ? `${url}?token=${encodeURIComponent(token)}` : url;
}

export async function getArtifacts(taskId: string): Promise<Artifact[]> {
  const artifacts: Artifact[] = await apiFetch(`/api/artifacts?task_id=${taskId}`);
  for (const a of artifacts) a.url = withAuthToken(a.url);
  return artifacts;
}

export async function uploadArtifact(taskId: string, file: File): Promise<Artifact> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip "data:mime;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const artifact: Artifact = await apiFetch('/api/artifacts', {
    method: 'POST',
    body: JSON.stringify({
      task_id: taskId,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      data: base64,
    }),
  });
  artifact.url = withAuthToken(artifact.url);
  return artifact;
}

export async function deleteArtifact(id: string) {
  return apiFetch(`/api/artifacts/${id}`, { method: 'DELETE' });
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

// --- Custom Task Types ---
export interface CustomTaskType {
  id: string;
  project_id: string;
  name: string;
  description: string;
  pipeline: string;
  created_at: string;
}

export async function getCustomTypes(projectId: string): Promise<CustomTaskType[]> {
  return apiFetch(`/api/custom-types?project_id=${projectId}`);
}

export async function createCustomType(projectId: string, name: string, pipeline?: string, description?: string): Promise<CustomTaskType> {
  return apiFetch('/api/custom-types', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, name, pipeline, description }),
  });
}

export async function deleteCustomType(id: string) {
  return apiFetch(`/api/custom-types/${id}`, { method: 'DELETE' });
}

// --- Flows ---
export interface FlowStep {
  id: string;
  name: string;
  position: number;
  instructions: string;
  model: string;
  tools: string[];
  context_sources: string[];
  is_gate: boolean;
  on_fail_jump_to: number | null;
  max_retries: number;
  on_max_retries: string;
  include_agents_md: boolean;
}

export interface Flow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  icon: string;
  is_builtin: boolean;
  agents_md: string | null;
  default_types: string[];
  flow_steps: FlowStep[];
  created_at: string;
}

export async function getFlows(projectId: string): Promise<Flow[]> {
  return apiFetch(`/api/flows?project_id=${projectId}`);
}

export async function createFlow(data: { project_id: string; name: string; description?: string; icon?: string; agents_md?: string; steps?: any[] }): Promise<Flow> {
  return apiFetch('/api/flows', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateFlow(id: string, data: Record<string, unknown>): Promise<Flow> {
  return apiFetch(`/api/flows/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteFlow(id: string) {
  return apiFetch(`/api/flows/${id}`, { method: 'DELETE' });
}

export async function updateFlowSteps(flowId: string, steps: any[]) {
  return apiFetch(`/api/flows/${flowId}/steps`, { method: 'PUT', body: JSON.stringify({ steps }) });
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

  const parse = (e: MessageEvent) => { try { return JSON.parse(e.data); } catch { return null; } };
  source.addEventListener('log', (e) => { const d = parse(e); if (d) handlers.onLog?.(d.text); });
  source.addEventListener('phase_start', (e) => { const d = parse(e); if (d) handlers.onPhaseStart?.(d.phase, d.attempt); });
  source.addEventListener('phase_complete', (e) => { const d = parse(e); if (d) handlers.onPhaseComplete?.(d.phase, d.output); });
  source.addEventListener('paused', (e) => { const d = parse(e); if (d) handlers.onPause?.(d.question); });
  source.addEventListener('review', (e) => { const d = parse(e); if (d) handlers.onReview?.(d); });
  source.addEventListener('done', () => { handlers.onDone?.(); source.close(); });
  source.addEventListener('failed', (e) => { const d = parse(e); handlers.onFail?.(d?.error || 'Unknown error'); source.close(); });
  return () => source.close();
}

// --- SSE: Realtime project changes ---
export function subscribeToChanges(projectId: string, onUpdate: (data: any) => void): () => void {
  const url = `${BASE}/api/changes?project_id=${projectId}${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ''}`;
  const source = new EventSource(url);
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  source.addEventListener('message', (e) => {
    consecutiveErrors = 0;
    try { onUpdate(JSON.parse(e.data)); } catch { /* malformed event */ }
  });

  source.onerror = () => {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      source.close();
    }
  };

  return () => source.close();
}
