#!/usr/bin/env tsx
// Direct Supabase realtime subscription test — bypasses our server entirely.
// If this receives events but our server doesn't, the bug is in realtime-channel.ts.
// If this ALSO fails, the bug is in Supabase/docker setup.

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

let eventCount = 0;
const channel = supabase
  .channel('debug-test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
    eventCount++;
    console.log(`[debug] Event received: ${payload.eventType} on tasks.id=${(payload.new as any)?.id || (payload.old as any)?.id}`);
  })
  .subscribe((status, err) => {
    console.log(`[debug] Channel status: ${status}`, err || '');
  });

// Wait 2 seconds for subscription to take effect
await new Promise((r) => setTimeout(r, 2000));

// Insert a test task
const { data: project } = await supabase.from('projects').select('id').limit(1).single();
if (!project) throw new Error('no project');

const { data: users } = await supabase.auth.admin.listUsers();
const user = users.users[0];

console.log('[debug] Inserting test task...');
const { data: task, error: insertErr } = await supabase
  .from('tasks')
  .insert({
    project_id: project.id,
    title: '__debug_realtime__',
    status: 'backlog',
    created_by: user.id,
  })
  .select('id')
  .single();

if (insertErr) {
  console.error('[debug] Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`[debug] Inserted task ${task.id}, waiting 3s for event...`);
await new Promise((r) => setTimeout(r, 3000));

console.log(`[debug] Cleanup...`);
await supabase.from('tasks').delete().eq('id', task.id);
await new Promise((r) => setTimeout(r, 1000));

console.log(`\n[debug] Total events received: ${eventCount} (expected >= 2)`);
await channel.unsubscribe();
process.exit(eventCount >= 2 ? 0 : 1);
