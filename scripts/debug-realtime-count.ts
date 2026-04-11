#!/usr/bin/env tsx
// Bisect: how many postgres_changes bindings can a single channel hold?
import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const COUNT = Number(process.argv[2] || '5');
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

let events = 0;
const tables = ['tasks', 'jobs', 'workstreams', 'flows', 'flow_steps', 'custom_task_types', 'project_members', 'project_invites', 'comments', 'task_artifacts', 'rag_documents', 'notifications'];
let ch = supabase.channel(`count-${COUNT}-${Date.now()}`);
for (let i = 0; i < COUNT; i++) {
  ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: tables[i] } as never, (payload: unknown) => {
    events++;
    console.log(`[count=${COUNT}] got event on ${tables[i]}:`, (payload as { eventType?: string }).eventType);
  });
}

ch.subscribe((status, err) => console.log(`[count=${COUNT}] status=${status}`, err ? err.message : ''));
await new Promise((r) => setTimeout(r, 2500));

const { data: project } = await supabase.from('projects').select('id').limit(1).single();
const { data: users } = await supabase.auth.admin.listUsers();

const { data: task, error } = await supabase
  .from('tasks')
  .insert({ project_id: project!.id, title: `__count_${COUNT}__`, status: 'backlog', created_by: users.users[0].id })
  .select('id')
  .single();
if (error) { console.error(error.message); process.exit(1); }

await new Promise((r) => setTimeout(r, 1500));
await supabase.from('tasks').delete().eq('id', task.id);
await new Promise((r) => setTimeout(r, 1000));

console.log(`[count=${COUNT}] total events: ${events}`);
await ch.unsubscribe();
process.exit(events >= 1 ? 0 : 1);
