import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee, employeeCanAccessContainer, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantHistory } from "@/lib/tenantHistory";

/**
 * Единая хронологическая история операций клиента — Mini App, тот же смысл, что и
 * app/api/tenants/[ownerKey]/history на веб-панели (см. lib/tenantHistory.ts). Сужена до
 * контейнеров, доступных сотруднику (см. lib/miniAuth.ts::allowedContainerIds) — как и карточка
 * клиента (app/api/miniapp/clients/[ownerKey]/route.ts).
 */
export async function GET(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const containerId = req.nextUrl.searchParams.get("containerId") || undefined;
    if (containerId && !employeeCanAccessContainer(employee, containerId)) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const events = await getTenantHistory(decodeURIComponent(params.ownerKey), { containerId, limit });
    const allowed = allowedContainerIds(employee);
    const visible = allowed ? events.filter((e) => allowed.includes(e.containerId)) : events;
    return NextResponse.json({ events: visible });
  } catch (err) {
    console.error("GET /api/miniapp/clients/[ownerKey]/history:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
