import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getFinanceSummary } from "@/lib/finance";

/**
 * Карточки «Общий приход/Расходы/Зарплата/Остаток/Касса» на странице «Оплаты».
 * containerId — сузить карточки до одного контейнера (см. lib/finance.ts::getFinanceSummary).
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const containerId = req.nextUrl.searchParams.get("containerId") || undefined;
    const summary = await getFinanceSummary({ containerId });
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("GET /api/finance/summary:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
