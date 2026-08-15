/**
 * Настраивает Telegram-бота на задеплоенном приложении: регистрирует webhook, список команд
 * (виден в меню "/" рядом с полем ввода) и постоянную кнопку меню, которая открывает Mini App
 * напрямую — без необходимости сначала написать /start. Без неё единственный вход в
 * приложение — ссылка в ответ на /start, что не то же самое, что "нормально настроенное"
 * Mini App (у большинства ботов с Mini App синяя кнопка меню — открытая по умолчанию точка
 * входа).
 * Запуск: npm run set-webhook  (нужны TELEGRAM_BOT_TOKEN, APP_BASE_URL,
 * опционально TELEGRAM_WEBHOOK_SECRET в .env.local)
 */
import "dotenv/config";

async function callTelegramApi(token: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  console.log(`${method}:`, data.ok ? "OK" : data);
  return data;
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appBaseUrl = process.env.APP_BASE_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в .env.local");
  if (!appBaseUrl) throw new Error("APP_BASE_URL не задан в .env.local");

  const base = appBaseUrl.replace(/\/$/, "");
  const webhookUrl = `${base}/api/telegram/webhook`;
  const miniAppUrl = `${base}/miniapp`;

  const params = new URLSearchParams({ url: webhookUrl });
  if (secret) params.set("secret_token", secret);

  const webhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`);
  const webhookData = await webhookRes.json();
  console.log("setWebhook:", webhookData);
  if (!webhookData.ok) process.exit(1);
  console.log(`Webhook установлен на: ${webhookUrl}`);

  // Список команд — показывается в системном меню "/" рядом с полем ввода сообщения.
  // Дублирует то, что уже обрабатывает lib/telegramBot.ts (bot.command(...)) — команда без
  // записи здесь тоже сработает, но останется "скрытой" (сотрудник должен знать её заранее).
  await callTelegramApi(token, "setMyCommands", {
    commands: [
      { command: "start", description: "Открыть приложение / начать работу" },
      { command: "report", description: "Сводка по моим товарам (для владельца груза)" },
      { command: "contract", description: "Получить PDF договора (для владельца груза)" },
      { command: "help", description: "Помощь" },
    ],
  });

  // Постоянная синяя кнопка меню слева от поля ввода — открывает Mini App НАПРЯМУЮ, в один
  // тап, без /start. Тип "web_app" (а не "commands"/"default") — именно то, что отличает
  // "просто бота" от "нормально настроенного приложения в Telegram".
  await callTelegramApi(token, "setChatMenuButton", {
    menu_button: { type: "web_app", text: "Открыть склад", web_app: { url: miniAppUrl } },
  });

  console.log("\nГотово: webhook, команды и кнопка меню настроены.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
