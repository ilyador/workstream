import { isMissingRowError } from './authz.js';
import { supabase } from './supabase.js';

export async function getSystemUserId(projectId?: string): Promise<string | null> {
  const { data: bot, error: botError } = await supabase
    .from('profiles')
    .select('id')
    .eq('name', 'WorkStream Bot')
    .limit(1)
    .single();
  if (botError && !isMissingRowError(botError)) console.error('[mcp] Failed to load WorkStream Bot profile:', botError.message);
  if (bot) return bot.id;

  if (projectId) {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('created_by')
      .eq('id', projectId)
      .single();
    if (projectError && !isMissingRowError(projectError)) {
      console.error(`[mcp] Failed to load project creator for ${projectId}:`, projectError.message);
    }
    if (project?.created_by) return project.created_by;
  }

  return null;
}
