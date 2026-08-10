import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllOwnerContainerDebts } from "@/lib/debt";

/**
 * Задолженность по связкам «владелец + контейнер», доступная сотруднику из Mini App —
 * нужна для выбора "кто платит → за какой контейнер" в форме записи оплаты
 * (см. components/miniapp/AddIncomeWizard.tsx). Та же бизнес-логика, что и GET /api/debts
 * на веб-панели (lib/debt.ts), но авторизация через Telegram initData, а не веб-сессию.
 */
export async function GET(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const debts = await getAllOwnerContainerDebts({ to: new Date() });
  return NextResponse.json({ debts });
}
