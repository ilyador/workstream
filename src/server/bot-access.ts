import type { Context } from 'grammy';

const allowAllTelegram = process.env.TELEGRAM_ALLOW_ALL === 'true';
const allowedTelegramChatIds = idSet(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
const allowedTelegramUserIds = idSet(process.env.TELEGRAM_ALLOWED_USER_IDS);

function idSet(value: string | undefined): Set<string> {
  return new Set((value || '').split(',').map(id => id.trim()).filter(Boolean));
}

function isTelegramAllowed(ctx: Context): boolean {
  if (allowAllTelegram) return true;
  const chatId = ctx.chat?.id.toString();
  const userId = ctx.from?.id.toString();
  return (!!chatId && allowedTelegramChatIds.has(chatId)) || (!!userId && allowedTelegramUserIds.has(userId));
}

export async function requireTelegramAccess(ctx: Context): Promise<boolean> {
  if (isTelegramAllowed(ctx)) return true;
  await ctx.reply('This Telegram chat is not authorized for WorkStream. Set TELEGRAM_ALLOWED_CHAT_IDS or TELEGRAM_ALLOWED_USER_IDS on the server to enable it.');
  return false;
}
