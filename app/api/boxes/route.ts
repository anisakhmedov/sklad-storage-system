import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllBoxBalances } from "@/lib/boxes";

/** Список всех должников по ящикам — веб-панель, страница «Ящики» (owner + trusted). */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const balances = await getAllBoxBalances();
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("GET /api/boxes:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
