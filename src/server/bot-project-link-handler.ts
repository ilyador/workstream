import type { Bot } from 'grammy';
import { requireTelegramAccess } from './bot-access.js';
import { isTelegramProjectAllowed, showProjectPicker } from './bot-projects.js';
import { supabase } from './supabase.js';

export function registerBotProjectLinkHandlers(bot: Bot): void {
  bot.command('start', async (ctx) => {
    if (!await requireTelegramAccess(ctx)) return;
    await showProjectPicker(bot, ctx.chat.id);
  });

  bot.command('switch', async (ctx) => {
    if (!await requireTelegramAccess(ctx)) return;
    await showProjectPicker(bot, ctx.chat.id);
  });

  bot.on('callback_query:data', async (ctx) => {
    if (!await requireTelegramAccess(ctx)) return;
    const data = ctx.callbackQuery.data;
    if (!data.startsWith('pick:')) return;
    const projectId = data.slice(5);
    if (!isTelegramProjectAllowed(projectId)) {
      await ctx.answerCallbackQuery({ text: 'Project is not available to this bot' });
      return;
    }

    const { data: project, error: projectError } = await supabase.from('projects').select('name').eq('id', projectId).single();
    if (projectError || !project) {
      await ctx.answerCallbackQuery({ text: 'Project not found' });
      return;
    }

    const { error: linkError } = await supabase.from('bot_chats').upsert(
      { chat_id: ctx.chat!.id, project_id: projectId },
      { onConflict: 'chat_id' },
    );
    if (linkError) {
      await ctx.answerCallbackQuery({ text: `Failed to link project: ${linkError.message}` });
      return;
    }

    const projectName = typeof project.name === 'string' ? project.name : 'project';
    await ctx.answerCallbackQuery({ text: `Linked to ${projectName}` });
    await ctx.editMessageText(`Linked to ${projectName}. Send me a message to interact with the project.`);
  });
}
