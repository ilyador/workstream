#!/usr/bin/env tsx
import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const channel = supabase
  .channel('debug-delete')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
    console.log(`[delete-payload] ${payload.eventType}:`);
    console.log('  new:', JSON.stringify(payload.new));
    console.log('  old:', JSON.stringify(payload.old));
  })
  .subscribe((status) => console.log('status:', status));

await new Promise((r) => setTimeout(r, 2000));

const { data: project } = await supabase.from('projects').select('id').limit(1).single();
const { data: users } = await supabase.auth.admin.listUsers();

const { data: task } = await supabase
  .from('tasks')
  .insert({ project_id: project!.id, title: '__delete_payload__', status: 'backlog', created_by: users.users[0].id })
  .select('id')
  .single();

await new Promise((r) => setTimeout(r, 500));

await supabase.from('tasks').delete().eq('id', task!.id);

await new Promise((r) => setTimeout(r, 1500));
await channel.unsubscribe();
process.exit(0);
