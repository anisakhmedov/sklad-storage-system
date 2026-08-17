import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getFinanceByContainer } from "@/lib/finance";

/** «Оборот и расход по контейнерам» — секция на странице «Оплаты», приход и расход отдельно по
 * каждому холодильнику (см. lib/finance.ts::getFinanceByContainer). */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const rows = await getFinanceByContainer();
    return NextResponse.json({ rows });
  } catch (err) {
    console.error("GET /api/finance/by-container:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
