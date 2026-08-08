/**
 * Регистрирует Telegram webhook на задеплоенном приложении.
 * Запуск: npm run set-webhook  (нужны TELEGRAM_BOT_TOKEN, APP_BASE_URL,
 * опционально TELEGRAM_WEBHOOK_SECRET в .env.local)
 */
import "dotenv/config";

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appBaseUrl = process.env.APP_BASE_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в .env.local");
  if (!appBaseUrl) throw new Error("APP_BASE_URL не задан в .env.local");

  const webhookUrl = `${appBaseUrl.replace(/\/$/, "")}/api/telegram/webhook`;

  const params = new URLSearchParams({ url: webhookUrl });
  if (secret) params.set("secret_token", secret);

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`);
  const data = await res.json();

  console.log("Ответ Telegram API:", data);
  if (!data.ok) {
    process.exit(1);
  }
  console.log(`\nWebhook установлен на: ${webhookUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
