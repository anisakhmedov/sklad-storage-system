import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { Container } from "@/models/Container";
import { allowedContainerIds } from "@/lib/miniAuth";
import { getTodayPatrolStatus, PATROL_LABELS } from "@/lib/patrols";
import { getBot } from "@/lib/telegramBot";
import { jsonError } from "@/lib/apiHelpers";

export const runtime = "nodejs";

/**
 * Напоминание сотрудникам сделать обход — вызывается по расписанию Vercel Cron (см. vercel.json,
 * 08:00 и 18:00 по Ташкенту) с `?period=morning|evening`. Защищено CRON_SECRET — без него
 * (или с неверным) Vercel Cron не сможет достучаться извне (см. .env.example).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonError("Не авторизован", 401);
  }

  const period = req.nextUrl.searchParams.get("period");
  if (period !== "morning" && period !== "evening") {
    return jsonError("Укажите ?period=morning|evening", 400);
  }

  await connectDB();
  const employees = await Employee.find({ status: "approved" }).lean();
  const allContainers = await Container.find().select("name").lean();

  let sent = 0;
  const bot = getBot();
  for (const employee of employees) {
    const allowed = allowedContainerIds(employee);
    const containers = allowed
      ? allContainers.filter((c) => allowed.includes(String(c._id)))
      : allContainers;
    if (containers.length === 0) continue;

    const status = await getTodayPatrolStatus(containers.map((c) => ({ id: String(c._id), name: c.name })));
    const pending = status.filter((s) => (period === "morning" ? !s.morningDone : !s.eveningDone));
    if (pending.length === 0) continue;

    try {
      await bot.api.sendMessage(
        Number(employee.telegramId),
        `⏰ Не забудьте сделать «${PATROL_LABELS[period]}» — откройте Mini App → «Обход». ` +
          `Осталось: ${pending.map((p) => p.containerName).join(", ")}.`
      );
      sent++;
    } catch (err) {
      console.error(`patrol-reminder: не удалось отправить сотруднику ${employee._id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, period, sent });
}
