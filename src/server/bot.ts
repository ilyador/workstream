import 'dotenv/config';
import { Bot } from 'grammy';
import { registerBotMessageHandler } from './bot-message-handler.js';
import { registerBotProjectLinkHandlers } from './bot-project-link-handler.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('[bot] TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

const bot = new Bot(token);

registerBotProjectLinkHandlers(bot);
registerBotMessageHandler(bot);

bot.start({
  onStart: () => console.log('[bot] WorkStream Telegram bot started'),
});

process.on('SIGTERM', () => { bot.stop(); process.exit(0); });
process.on('SIGINT', () => { bot.stop(); process.exit(0); });
