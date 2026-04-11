#!/usr/bin/env tsx
/**
 * SSE smoke test: verifies the broadcast pipeline end-to-end.
 *
 *   pnpm smoke:sse
 *
 * 1. Mint a JWT for an existing user (using the local Supabase HS256 secret).
 * 2. Ensure they're an admin on a test project.
 * 3. Open an SSE stream to /api/changes.
 * 4. Trigger DB changes via the service role (tasks, jobs, comments, artifacts).
 * 5. For each change, wait for the corresponding SSE event and report.
 * 6. Clean up test rows; exit non-zero if any expected event was missing.
 */

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import http from 'node:http';

const SERVER_PORT = Number(process.env.PORT || 3001);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  'super-secret-jwt-token-with-at-least-32-characters-long';
const EVENT_TIMEOUT_MS = Number(process.env.SMOKE_EVENT_TIMEOUT_MS || 3000);
const TEST_TAG = `__smoke_${Date.now()}__`;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- JWT helper (HS256) ---
function signJwt(sub: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 };
  const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const h = enc(header);
  const p = enc(body);
  const sig = createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

// --- SSE client ---
type SseEvent = { type: string; [key: string]: unknown };
type Received = { event: SseEvent; at: number };

function openSse(projectId: string, token: string): {
  received: Received[];
  close: () => void;
  ready: Promise<void>;
} {
  const received: Received[] = [];
  const start = Date.now();
  let req: http.ClientRequest | null = null;

  const ready = new Promise<void>((resolve, reject) => {
    req = http.request(
      {
        host: '127.0.0.1',
        port: SERVER_PORT,
        path: `/api/changes?project_id=${encodeURIComponent(projectId)}&token=${encodeURIComponent(token)}`,
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (c) => (body += c.toString()));
          res.on('end', () => reject(new Error(`SSE failed ${res.statusCode}: ${body}`)));
          return;
        }
        resolve();
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              received.push({ event: JSON.parse(line.slice(6)) as SseEvent, at: Date.now() - start });
            } catch {
              /* malformed */
            }
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

  return {
    received,
    ready,
    close: () => req?.destroy(),
  };
}

async function waitFor(
  received: Received[],
  match: (e: SseEvent) => boolean,
  timeoutMs: number,
): Promise<{ ok: boolean; event?: SseEvent; elapsedMs: number }> {
  const start = Date.now();
  // Only consider events that arrive AFTER we start waiting
  const baselineIdx = received.length;
  while (Date.now() - start < timeoutMs) {
    for (let i = baselineIdx; i < received.length; i++) {
      if (match(received[i].event)) return { ok: true, event: received[i].event, elapsedMs: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return { ok: false, elapsedMs: Date.now() - start };
}

// --- Fixture setup ---
const { data: users, error: usersErr } = await supabase.auth.admin.listUsers();
if (usersErr || !users?.users?.length) {
  console.error('Could not list users:', usersErr?.message);
  process.exit(2);
}
const testUser = users.users[0];

const { data: projects, error: projectsErr } = await supabase.from('projects').select('id, name').limit(1);
if (projectsErr || !projects?.length) {
  console.error('Could not list projects:', projectsErr?.message);
  process.exit(2);
}
const testProject = projects[0];

await supabase
  .from('project_members')
  .upsert(
    { project_id: testProject.id, user_id: testUser.id, role: 'admin' },
    { onConflict: 'project_id,user_id' },
  );

const token = signJwt(testUser.id);

console.log(`[smoke] project: ${testProject.name} (${testProject.id})`);
console.log(`[smoke] user:    ${testUser.email} (${testUser.id})`);
console.log(`[smoke] server:  http://127.0.0.1:${SERVER_PORT}`);

const sse = openSse(testProject.id, token);
try {
  await sse.ready;
  console.log('[smoke] SSE stream connected');
} catch (err) {
  console.error('[smoke] Failed to open SSE:', (err as Error).message);
  process.exit(1);
}

// Give server a moment to register the listener
await new Promise((r) => setTimeout(r, 200));

// --- Test cases ---
type Result = { name: string; expected: string; ok: boolean; elapsedMs: number; note?: string };
const results: Result[] = [];
const cleanup: Array<() => Promise<unknown>> = [];

async function run(
  name: string,
  expectedType: string,
  trigger: () => Promise<void>,
  matcher: (e: SseEvent) => boolean = (e) => e.type === expectedType,
): Promise<void> {
  await trigger();
  const r = await waitFor(sse.received, matcher, EVENT_TIMEOUT_MS);
  results.push({ name, expected: expectedType, ok: r.ok, elapsedMs: r.elapsedMs });
}

try {
  // Task insert/update/delete
  let taskId = '';
  await run('task insert', 'task_changed', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: testProject.id,
        title: `${TEST_TAG} task`,
        status: 'backlog',
        created_by: testUser.id,
      })
      .select('id')
      .single();
    if (error) throw error;
    taskId = data.id;
    cleanup.push(() => supabase.from('tasks').delete().eq('id', taskId));
  });

  await run('task update', 'task_changed', async () => {
    const { error } = await supabase.from('tasks').update({ title: `${TEST_TAG} updated` }).eq('id', taskId);
    if (error) throw error;
  });

  await run('task delete', 'task_deleted', async () => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  });
  // Already deleted — drop the cleanup entry
  cleanup.pop();

  // Job insert/update/delete — jobs reference a task
  const { data: anchorTask, error: anchorErr } = await supabase
    .from('tasks')
    .insert({
      project_id: testProject.id,
      title: `${TEST_TAG} anchor`,
      status: 'backlog',
      created_by: testUser.id,
    })
    .select('id')
    .single();
  if (anchorErr) throw anchorErr;
  cleanup.push(() => supabase.from('tasks').delete().eq('id', anchorTask.id));

  let jobId = '';
  await run('job insert', 'job_changed', async () => {
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        project_id: testProject.id,
        task_id: anchorTask.id,
        status: 'queued',
      })
      .select('id')
      .single();
    if (error) throw error;
    jobId = data.id;
    cleanup.push(() => supabase.from('jobs').delete().eq('id', jobId));
  });

  await run('job update', 'job_changed', async () => {
    const { error } = await supabase.from('jobs').update({ status: 'running' }).eq('id', jobId);
    if (error) throw error;
  });

  await run('job delete', 'job_deleted', async () => {
    const { error } = await supabase.from('jobs').delete().eq('id', jobId);
    if (error) throw error;
  });
  cleanup.pop();

  // Comment (task-scoped)
  let commentId = '';
  await run('comment insert', 'comment_changed', async () => {
    const { data, error } = await supabase
      .from('comments')
      .insert({
        task_id: anchorTask.id,
        user_id: testUser.id,
        body: `${TEST_TAG} comment`,
      })
      .select('id')
      .single();
    if (error) throw error;
    commentId = data.id;
    cleanup.push(() => supabase.from('comments').delete().eq('id', commentId));
  });

  // rag_documents — tests our new subscription
  let docId = '';
  await run('document insert', 'document_changed', async () => {
    const { data, error } = await supabase
      .from('rag_documents')
      .insert({
        project_id: testProject.id,
        file_name: `${TEST_TAG}.md`,
        file_type: 'md',
        file_size: 10,
        status: 'ready',
      })
      .select('id')
      .single();
    if (error) throw error;
    docId = data.id;
    cleanup.push(() => supabase.from('rag_documents').delete().eq('id', docId));
  });

  // notifications — tests our new handler that resolves project_id via task lookup
  await run('notification insert (via task)', 'notification_changed', async () => {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: testUser.id,
        type: 'mention',
        task_id: anchorTask.id,
        message: `${TEST_TAG} mention`,
      })
      .select('id')
      .single();
    if (error) throw error;
    cleanup.push(() => supabase.from('notifications').delete().eq('id', data.id));
  });

  let workstreamId = '';
  await run('workstream insert', 'workstream_changed', async () => {
    const { data, error } = await supabase
      .from('workstreams')
      .insert({
        project_id: testProject.id,
        name: `${TEST_TAG} ws`,
        status: 'active',
      })
      .select('id')
      .single();
    if (error) throw error;
    workstreamId = data.id;
    cleanup.push(() => supabase.from('workstreams').delete().eq('id', workstreamId));
  });

  await run('workstream update', 'workstream_changed', async () => {
    const { error } = await supabase.from('workstreams').update({ name: `${TEST_TAG} ws updated` }).eq('id', workstreamId);
    if (error) throw error;
  });

  await run('workstream delete', 'workstream_deleted', async () => {
    const { error } = await supabase.from('workstreams').delete().eq('id', workstreamId);
    if (error) throw error;
  });
  cleanup.pop();

  let flowId = '';
  await run('flow insert', 'flow_changed', async () => {
    const { data, error } = await supabase
      .from('flows')
      .insert({
        project_id: testProject.id,
        name: `${TEST_TAG} flow`,
      })
      .select('id')
      .single();
    if (error) throw error;
    flowId = data.id;
    cleanup.push(() => supabase.from('flows').delete().eq('id', flowId));
  });

  await run('flow update', 'flow_changed', async () => {
    const { error } = await supabase.from('flows').update({ name: `${TEST_TAG} flow updated` }).eq('id', flowId);
    if (error) throw error;
  });

  await run('flow delete', 'flow_deleted', async () => {
    const { error } = await supabase.from('flows').delete().eq('id', flowId);
    if (error) throw error;
  });
  cleanup.pop();

  await run('custom type insert', 'custom_type_changed', async () => {
    const { data, error } = await supabase
      .from('custom_task_types')
      .insert({
        project_id: testProject.id,
        name: `${TEST_TAG.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        description: 'smoke test',
      })
      .select('id')
      .single();
    if (error) throw error;
    cleanup.push(() => supabase.from('custom_task_types').delete().eq('id', data.id));
  });
} catch (err) {
  console.error('[smoke] Fatal error during test run:', (err as Error).message);
} finally {
  // Cleanup in reverse order
  for (const fn of cleanup.reverse()) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
  sse.close();
}

// --- Report ---
console.log('\n=== SSE Smoke Test Results ===');
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
for (const r of results) {
  const icon = r.ok ? '✓' : '✗';
  const status = r.ok ? `arrived in ${r.elapsedMs}ms` : `TIMED OUT after ${r.elapsedMs}ms`;
  console.log(`${icon} ${pad(r.name, 32)} expected=${pad(r.expected, 22)} ${status}`);
}

const failures = results.filter((r) => !r.ok);
const total = results.length;
console.log(`\n${total - failures.length}/${total} passed`);
process.exit(failures.length > 0 ? 1 : 0);
