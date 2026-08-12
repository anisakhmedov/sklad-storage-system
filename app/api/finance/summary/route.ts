import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getFinanceSummary } from "@/lib/finance";

/** Карточки «Общий приход/Расходы/Зарплата/Остаток/Касса» на странице «Оплаты». */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const summary = await getFinanceSummary();
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("GET /api/finance/summary:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
