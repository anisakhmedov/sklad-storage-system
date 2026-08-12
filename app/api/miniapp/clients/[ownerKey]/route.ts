import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";
import { getOwnerSummaryByKey } from "@/lib/reports";

/**
 * Карточка клиента (владельца груза) для раздела «Клиенты» в Mini App — постатейная разбивка
 * по контейнерам, задолженность. Сужена до контейнеров, доступных сотруднику (см.
 * lib/miniAuth.ts::allowedContainerIds), поэтому клиент без записей в доступных контейнерах
 * выглядит как "не найден", даже если у него есть записи в других контейнерах.
 */
export async function GET(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const ownerKey = decodeURIComponent(params.ownerKey);
    const summary = await getOwnerSummaryByKey(ownerKey, { containerIds: allowedContainerIds(employee) });
    if (!summary || summary.recordCount === 0) {
      return jsonError("Клиент не найден или недоступен", 404);
    }

    return NextResponse.json({ ownerKey, summary });
  } catch (err) {
    console.error("GET /api/miniapp/clients/[ownerKey]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
