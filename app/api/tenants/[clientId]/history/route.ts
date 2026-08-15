import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantHistory } from "@/lib/tenantHistory";

/**
 * Единая хронологическая история операций арендатора (приём/отдача товара, выдача/возврат
 * инвентаря, оплаты) — веб-панель, страница арендатора
 * (app/dashboard/tenants/[clientId]/page.tsx). См. lib/tenantHistory.ts.
 */
export async function GET(req: NextRequest, { params }: { params: { clientId: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const containerId = req.nextUrl.searchParams.get("containerId") || undefined;
    const events = await getTenantHistory(decodeURIComponent(params.clientId), { containerId });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("GET /api/tenants/[clientId]/history:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
