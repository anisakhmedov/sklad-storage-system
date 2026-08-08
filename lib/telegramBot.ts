import { Bot, InlineKeyboard, webhookCallback } from "grammy";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

let botInstance: Bot | null = null;

/**
 * Ленивая инициализация бота: не падаем на билде/dev, если токен ещё не задан.
 * В таком случае webhook-роут вернёт понятную ошибку вместо краша всего приложения.
 */
export function getBot(): Bot {
  if (botInstance) return botInstance;
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN не задан. Укажите его в .env.local, чтобы бот заработал."
    );
  }

  const bot = new Bot(token);
  const miniAppUrl = `${appBaseUrl}/miniapp`;

  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("📦 Открыть приложение", miniAppUrl);
    await ctx.reply(
      "Добро пожаловать в систему учёта хранения продукции!\n\n" +
        "Нажмите кнопку ниже, чтобы открыть приложение и зарегистрироваться " +
        "(если это ваш первый вход) или внести новую запись.",
      { reply_markup: keyboard }
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Это бот системы учёта хранения продукции в контейнерах.\n" +
        "Используйте /start, чтобы открыть приложение."
    );
  });

  // На любой другой текст — тоже предлагаем открыть Mini App
  bot.on("message", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("📦 Открыть приложение", miniAppUrl);
    await ctx.reply("Откройте приложение, чтобы продолжить:", { reply_markup: keyboard });
  });

  botInstance = bot;
  return bot;
}

export function getWebhookHandler() {
  const bot = getBot();
  return webhookCallback(bot, "std/http");
}
