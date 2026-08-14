import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantMatrix } from "@/lib/tenantMatrix";

/** Сводная таблица «Арендаторы» → вид «Таблица по камерам» (см. lib/tenantMatrix.ts). */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const sections = await getTenantMatrix();
    return NextResponse.json({ sections });
  } catch (err) {
    console.error("GET /api/tenants/matrix:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
