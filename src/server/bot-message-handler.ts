import type { Bot } from 'grammy';
import { isMissingRowError } from './authz.js';
import { executeAction, parseActions } from './bot-actions.js';
import { requireTelegramAccess } from './bot-access.js';
import { askClaude, buildProjectSummary, buildSystemPrompt } from './bot-assistant.js';
import { getLinkedProject } from './bot-projects.js';
import { supabase } from './supabase.js';

export function registerBotMessageHandler(bot: Bot): void {
  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chat.id;
    let userMsg = ctx.message.text;

    if (userMsg.startsWith('/')) return;

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    if (isGroup) {
      const botInfo = await bot.api.getMe();
      const botUsername = botInfo.username;
      const mentioned = botUsername && userMsg.includes(`@${botUsername}`);
      const repliedToBot = ctx.message.reply_to_message?.from?.id === botInfo.id;
      if (!mentioned && !repliedToBot) return;
      if (botUsername) userMsg = userMsg.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
      if (!userMsg) return;
    }
    if (!await requireTelegramAccess(ctx)) return;

    const projectId = await getLinkedProject(chatId);
    if (!projectId) {
      await ctx.reply('No project linked to this chat. Use /start to pick one.');
      return;
    }

    const thinking = await ctx.reply('Thinking...');

    try {
      const { data: project, error: projectError } = await supabase.from('projects').select('name').eq('id', projectId).single();
      if (projectError && !isMissingRowError(projectError)) throw new Error(projectError.message);
      const summary = await buildProjectSummary(projectId);
      const systemPrompt = buildSystemPrompt(project?.name || 'Unknown', summary);

      const response = await askClaude(systemPrompt, userMsg);
      const { text, actions } = parseActions(response);

      const results: string[] = [];
      for (const action of actions) {
        const result = await executeAction(action, projectId);
        results.push(result);
      }

      let reply = text;
      if (results.length > 0) reply += '\n\n' + results.map(result => `_${result}_`).join('\n');
      if (reply.length > 4000) reply = reply.slice(0, 4000) + '...';

      await bot.api.editMessageText(chatId, thinking.message_id, reply || 'Done.', { parse_mode: 'Markdown' }).catch(async () => {
        await bot.api.editMessageText(chatId, thinking.message_id, reply || 'Done.');
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[bot] Error:', message);
      await bot.api.editMessageText(chatId, thinking.message_id, `Error: ${message}`).catch(() => {});
    }
  });
}
