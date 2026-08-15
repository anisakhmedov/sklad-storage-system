import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantHistory } from "@/lib/tenantHistory";

/**
 * Единая хронологическая история операций арендатора (приём/отдача товара, выдача/возврат
 * инвентаря, оплаты) — веб-панель, страница арендатора
 * (app/dashboard/tenants/[ownerKey]/page.tsx). См. lib/tenantHistory.ts.
 */
export async function GET(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const containerId = req.nextUrl.searchParams.get("containerId") || undefined;
    const events = await getTenantHistory(decodeURIComponent(params.ownerKey), { containerId });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("GET /api/tenants/[ownerKey]/history:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
