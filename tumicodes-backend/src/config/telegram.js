const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.ADMIN_CHAT_ID;
let bot = null;
if (token) {
  bot = new TelegramBot(token, { polling: false });
}
module.exports = {
  sendAdmin: async (text) => {
    if (!bot || !chatId) return Promise.resolve();
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
};