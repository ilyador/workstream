import { InlineKeyboard, type Bot } from 'grammy';
import { isMissingRowError } from './authz.js';
import { supabase } from './supabase.js';

const allowedTelegramProjectIds = new Set(
  (process.env.TELEGRAM_ALLOWED_PROJECT_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
);

export function isTelegramProjectAllowed(projectId: string): boolean {
  return allowedTelegramProjectIds.size === 0 || allowedTelegramProjectIds.has(projectId);
}

export async function getLinkedProject(chatId: number): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('bot_chats')
    .select('project_id')
    .eq('chat_id', chatId)
    .single();
  if (error && !isMissingRowError(error)) console.error('[bot] Failed to load linked project:', error.message);
  const projectId = typeof data?.project_id === 'string' ? data.project_id : undefined;
  return projectId && isTelegramProjectAllowed(projectId) ? projectId : undefined;
}

export async function showProjectPicker(bot: Bot, chatId: number): Promise<void> {
  let query = supabase.from('projects').select('id, name').order('name');
  if (allowedTelegramProjectIds.size > 0) {
    query = query.in('id', Array.from(allowedTelegramProjectIds));
  }
  const { data: projects, error } = await query;
  if (error) {
    await bot.api.sendMessage(chatId, `Failed to load projects: ${error.message}`);
    return;
  }
  if (!projects || projects.length === 0) {
    await bot.api.sendMessage(chatId, 'No Telegram-accessible projects found in WorkStream.');
    return;
  }
  const kb = new InlineKeyboard();
  for (const p of projects) {
    kb.text(p.name, `pick:${p.id}`).row();
  }
  await bot.api.sendMessage(chatId, 'Pick a project:', { reply_markup: kb });
}
