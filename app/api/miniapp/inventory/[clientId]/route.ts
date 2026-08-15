import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllInventoryBalances } from "@/lib/inventoryLedger";

/**
 * Остаток инвентаря конкретного клиента (сколько на руках) — блок «Инвентарь» в карточке
 * клиента Mini App (см. components/miniapp/InventorySection.tsx). Выдача/приём — уже
 * существующий POST /api/miniapp/inventory (см. app/api/miniapp/inventory/route.ts).
 */
export async function GET(req: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const clientId = decodeURIComponent(params.clientId);
    const allowed = allowedContainerIds(employee);
    const balances = (await getAllInventoryBalances(clientId)).filter(
      (b) => !allowed || allowed.includes(b.containerId)
    );
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("GET /api/miniapp/inventory/[clientId]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
