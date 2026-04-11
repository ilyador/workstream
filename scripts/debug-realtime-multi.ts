#!/usr/bin/env tsx
// Replicates the exact pattern of realtime-channel.ts to isolate what breaks.
import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

let events = 0;
const onEvent = (name: string) => (payload: unknown) => {
  events++;
  console.log(`[multi] ${name}:`, (payload as { eventType?: string }).eventType);
};

const channel = supabase
  .channel('db-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onEvent('tasks'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, onEvent('jobs'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'workstreams' }, onEvent('workstreams'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flows' }, onEvent('flows'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'flow_steps' }, onEvent('flow_steps'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_task_types' }, onEvent('custom_task_types'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, onEvent('project_members'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invites' }, onEvent('project_invites'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, onEvent('comments'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'task_artifacts' }, onEvent('task_artifacts'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'rag_documents' }, onEvent('rag_documents'))
  .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onEvent('notifications'))
  .subscribe((status, err) => {
    console.log(`[multi] Channel status: ${status}`, err ? `err=${err.message}` : '');
  });

await new Promise((r) => setTimeout(r, 3000));

const { data: project } = await supabase.from('projects').select('id').limit(1).single();
const { data: users } = await supabase.auth.admin.listUsers();
const user = users.users[0];

console.log('[multi] Inserting task...');
const { data: task, error: insErr } = await supabase
  .from('tasks')
  .insert({ project_id: project!.id, title: '__multi_debug__', status: 'backlog', created_by: user.id })
  .select('id')
  .single();

if (insErr) {
  console.error('[multi] Insert failed:', insErr.message);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 2000));
await supabase.from('tasks').delete().eq('id', task.id);
await new Promise((r) => setTimeout(r, 1000));

console.log(`[multi] Total events received: ${events}`);
await channel.unsubscribe();
process.exit(events >= 2 ? 0 : 1);
