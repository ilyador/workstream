import { isMissingRowError } from '../authz.js';
import { supabase } from '../supabase.js';

interface MentionNotificationParams {
  body: string;
  projectId: string;
  taskId: string;
  currentUserId: string;
}

export async function notifyMentionedUsers(params: MentionNotificationParams): Promise<void> {
  const mentions = params.body.match(/@(\w+)/g);
  if (!mentions) return;

  const seen = new Set<string>();
  for (const mention of mentions) {
    const name = mention.slice(1);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .ilike('name', `${name}%`)
      .limit(1)
      .single();
    if (profileError && !isMissingRowError(profileError)) {
      console.error('[comments] Failed to resolve mention profile:', profileError.message);
      continue;
    }

    if (!profile || profile.id === params.currentUserId) continue;
    const { data: member, error: memberError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', params.projectId)
      .eq('user_id', profile.id)
      .single();
    if (memberError && !isMissingRowError(memberError)) {
      console.error('[comments] Failed to verify mentioned project member:', memberError.message);
      continue;
    }
    if (!member) continue;

    const { error: notificationError } = await supabase.from('notifications').insert({
      user_id: profile.id,
      type: 'mention',
      task_id: params.taskId,
      message: 'You were mentioned in a comment on a task',
    });
    if (notificationError) console.error('[comments] Failed to create mention notification:', notificationError.message);
  }
}
