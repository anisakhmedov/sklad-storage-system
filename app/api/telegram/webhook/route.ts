import { NextRequest, NextResponse } from "next/server";
import { getWebhookHandler } from "@/lib/telegramBot";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN не настроен на сервере" },
      { status: 500 }
    );
  }

  if (expectedSecret && secretHeader !== expectedSecret) {
    return NextResponse.json({ error: "Неверный секрет webhook" }, { status: 401 });
  }

  try {
    const handler = getWebhookHandler();
    return await handler(req);
  } catch (err) {
    console.error("Telegram webhook error:", err);
    return NextResponse.json({ error: "Внутренняя ошибка обработки webhook" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Telegram webhook endpoint. Используйте POST для обновлений от Telegram.",
  });
}
