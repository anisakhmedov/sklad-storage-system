import { Bot, Context, InlineKeyboard, Keyboard, InputFile, webhookCallback } from "grammy";
import { connectDB } from "./db";
import { Employee } from "@/models/Employee";
import { normalizePhone } from "./phone";
import {
  identifyOwnerByPhone,
  linkGoodsOwner,
  getGoodsOwnerLinkByTelegramId,
  isReportRequest,
  isContractRequest,
  isDeclineKeyboard,
  formatOwnerSummaryMessage,
  OWNER_HELP_TEXT,
  ASK_PHONE_TEXT,
  NOT_FOUND_TEXT,
  CONTACT_MISMATCH_TEXT,
} from "./goodsOwnerBot";
import { getGoodsOwnerSummary } from "./reports";
import { findLatestIndividualContractByPhone } from "./contract/contractService";

const token = process.env.TELEGRAM_BOT_TOKEN;
const appBaseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

let botInstance: Bot | null = null;

const WELCOME_EMPLOYEE_TEXT =
  "Добро пожаловать в систему учёта хранения продукции!\n\n" +
  "Нажмите кнопку ниже, чтобы открыть приложение и зарегистрироваться " +
  "(если это ваш первый вход) или внести новую запись.";

/**
 * Часть 2/3 ТЗ — бот теперь общается не только с сотрудниками (через Mini App), но и
 * с владельцами груза (арендаторами) обычными текстовыми сообщениями в чате. Различение:
 *  - сотрудники используют Mini App (см. lib/miniAuth.ts, отдельная авторизация по initData) —
 *    в самом боте они видны как записи в Employee по telegramId;
 *  - все остальные, кто пишет боту напрямую, — потенциальные владельцы груза; они
 *    идентифицируются по номеру телефона через GoodsOwnerLink (см. lib/goodsOwnerBot.ts).
 *
 * На /start у ещё неизвестного пользователя нельзя заранее знать, кто он — будущий
 * сотрудник (ещё не открывавший Mini App) или владелец груза, поэтому ему показываются
 * ОБА варианта: кнопка открытия Mini App (как раньше, часть 1) и кнопка "Отправить номер
 * телефона" (часть 2). Это осознанный дефолт, чтобы не сломать онбординг новых сотрудников —
 * подробнее см. README → «Допущения».
 */
async function handleReportRequest(ctx: Context, telegramId: string, contactKeyboard: Keyboard) {
  const link = await getGoodsOwnerLinkByTelegramId(telegramId);
  if (!link) {
    await ctx.reply(ASK_PHONE_TEXT, { reply_markup: contactKeyboard });
    return;
  }
  const summary = await getGoodsOwnerSummary(link.phone);
  if (summary.recordCount === 0) {
    await ctx.reply("По вашему номеру телефона пока нет ни одной записи.");
    return;
  }
  await ctx.reply(formatOwnerSummaryMessage(link.fullName, summary), { parse_mode: "Markdown" });
}

async function handleContractRequest(ctx: Context, telegramId: string, contactKeyboard: Keyboard) {
  const link = await getGoodsOwnerLinkByTelegramId(telegramId);
  if (!link) {
    await ctx.reply(ASK_PHONE_TEXT, { reply_markup: contactKeyboard });
    return;
  }
  const result = await findLatestIndividualContractByPhone(link.phone);
  if (!result) {
    await ctx.reply("Не нашли договор по вашему номеру телефона. Обратитесь к сотруднику склада.");
    return;
  }
  const caption =
    result.total > 1
      ? `Ваш договор по самой свежей записи (от ${new Date(result.createdAt).toLocaleDateString("ru-RU")}). ` +
        `Записей на ваш номер несколько (${result.total}) — если нужен договор по другой, обратитесь к сотруднику склада.`
      : "Ваш договор хранения груза.";
  await ctx.replyWithDocument(new InputFile(result.buffer, result.filename), { caption });
}

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

  const openAppKeyboard = new InlineKeyboard().webApp("📦 Открыть приложение", miniAppUrl);
  const contactKeyboard = new Keyboard()
    .requestContact("📱 Отправить номер телефона")
    .row()
    .text("Не сейчас")
    .resized()
    .oneTime();

  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const telegramId = String(ctx.from.id);
    await connectDB();
    const employee = await Employee.findOne({ telegramId }).lean();

    if (employee) {
      await ctx.reply(WELCOME_EMPLOYEE_TEXT, { reply_markup: openAppKeyboard });
      return;
    }

    const link = await getGoodsOwnerLinkByTelegramId(telegramId);
    if (link) {
      await ctx.reply(`С возвращением, ${link.fullName}! ${OWNER_HELP_TEXT}`);
      return;
    }

    // Пользователь неизвестен — предлагаем оба пути (сотрудник / владелец груза).
    await ctx.reply(WELCOME_EMPLOYEE_TEXT, { reply_markup: openAppKeyboard });
    await ctx.reply(ASK_PHONE_TEXT, { reply_markup: contactKeyboard });
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Это бот системы учёта хранения продукции в контейнерах.\n" +
        "Сотрудники склада: /start откроет Mini App.\n" +
        `Владельцы груза: ${OWNER_HELP_TEXT}`
    );
  });

  bot.command("report", async (ctx) => {
    if (!ctx.from) return;
    await handleReportRequest(ctx, String(ctx.from.id), contactKeyboard);
  });

  bot.command("contract", async (ctx) => {
    if (!ctx.from) return;
    await handleContractRequest(ctx, String(ctx.from.id), contactKeyboard);
  });

  // Владелец груза поделился номером телефона в ответ на кнопку "Отправить номер телефона".
  bot.on("message:contact", async (ctx) => {
    if (!ctx.from) return;
    const contact = ctx.message.contact;

    // request_contact гарантирует, что это "свой" контакт, но на всякий случай проверяем —
    // пересланная чужая визитка не должна привязываться к чужому telegramId.
    if (contact.user_id && contact.user_id !== ctx.from.id) {
      await ctx.reply(CONTACT_MISMATCH_TEXT, { reply_markup: contactKeyboard });
      return;
    }

    const phone = normalizePhone(contact.phone_number);
    const result = await identifyOwnerByPhone(phone);
    if (!result.matched || !result.fullName) {
      await ctx.reply(NOT_FOUND_TEXT, { reply_markup: { remove_keyboard: true } });
      return;
    }

    await linkGoodsOwner(String(ctx.from.id), phone, result.fullName);
    await ctx.reply(`Здравствуйте, ${result.fullName}! Номер подтверждён. ${OWNER_HELP_TEXT}`, {
      reply_markup: { remove_keyboard: true },
    });
  });

  // Любое другое текстовое сообщение — маршрутизация между сотрудником / владельцем
  // груза / ещё неопознанным пользователем.
  bot.on("message:text", async (ctx) => {
    if (!ctx.from) return;
    const telegramId = String(ctx.from.id);
    const text = ctx.message.text;

    if (isDeclineKeyboard(text)) {
      await ctx.reply("Хорошо. Если понадобится — просто поделитесь номером телефона позже.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    const link = await getGoodsOwnerLinkByTelegramId(telegramId);
    if (link) {
      if (isContractRequest(text)) {
        await handleContractRequest(ctx, telegramId, contactKeyboard);
        return;
      }
      if (isReportRequest(text)) {
        await handleReportRequest(ctx, telegramId, contactKeyboard);
        return;
      }
      await ctx.reply(OWNER_HELP_TEXT);
      return;
    }

    await connectDB();
    const employee = await Employee.findOne({ telegramId }).lean();
    if (employee) {
      await ctx.reply("Откройте приложение, чтобы продолжить:", { reply_markup: openAppKeyboard });
      return;
    }

    await ctx.reply(ASK_PHONE_TEXT, { reply_markup: contactKeyboard });
  });

  botInstance = bot;
  return bot;
}

export function getWebhookHandler() {
  const bot = getBot();
  return webhookCallback(bot, "std/http");
}
