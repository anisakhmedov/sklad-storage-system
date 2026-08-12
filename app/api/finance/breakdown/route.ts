import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getIncomeBreakdown } from "@/lib/finance";

/** Разбивка платежей по холодильникам и камерам — секция на странице «Оплаты». */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const breakdown = await getIncomeBreakdown();
    return NextResponse.json({ breakdown });
  } catch (err) {
    console.error("GET /api/finance/breakdown:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
