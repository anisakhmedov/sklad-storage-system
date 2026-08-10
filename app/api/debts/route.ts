import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllOwnerContainerDebts } from "@/lib/debt";

/**
 * Задолженность по всем связкам «владелец + контейнер» на дату `to` (по умолчанию —
 * сегодня). Тот же ответ используется на веб-панели и для выпадающих списков
 * "человек → его контейнер" в форме записи оплаты (см. app/dashboard/income/page.tsx),
 * и для получения задолженности через бота (см. lib/goodsOwnerBot.ts).
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const toParam = req.nextUrl.searchParams.get("to");
  let to = new Date();
  if (toParam) {
    const parsed = new Date(toParam);
    if (isNaN(parsed.getTime())) return jsonError("Некорректная дата", 400);
    // <input type="date"> присылает дату без времени — считаем её включительно (конец дня).
    parsed.setUTCHours(23, 59, 59, 999);
    to = parsed;
  }

  const debts = await getAllOwnerContainerDebts({ to });
  return NextResponse.json({ debts, to: to.toISOString() });
}
