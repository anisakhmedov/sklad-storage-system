import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee, employeeCanAccessContainer, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryDisposalCreateSchemaEmployee } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { createInventoryDisposal, getInventoryDisposals, InventoryDisposalError } from "@/lib/inventoryDisposal";

/** Продажа/списание инвентаря — Mini App, тот же смысл, что и app/api/inventory/disposals
 * на веб-панели (см. models/InventoryDisposalEntry.ts). Заменяет собой прежний раздел
 * "Контейнеры для перевозки". */
export async function GET(req: NextRequest) {
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

    const allowed = allowedContainerIds(employee);
    const entries = await getInventoryDisposals({ containerId });
    // allowedContainerIds() === undefined значит "доступ ко всем" — фильтровать не нужно.
    // containerId у элемента уже populate-нут (см. getInventoryDisposals) — сравниваем по _id,
    // а не по всему объекту (String(объект) дал бы "[object Object]").
    const visible = allowed
      ? entries.filter((e) => allowed.includes(String((e.containerId as any)?._id ?? e.containerId)))
      : entries;
    return NextResponse.json({ entries: visible });
  } catch (err) {
    console.error("GET /api/miniapp/inventory/disposals:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = inventoryDisposalCreateSchemaEmployee.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    const entry = await createInventoryDisposal({
      ...parsed.data,
      createdBy: employee.name,
      createdByRole: "employee",
    });

    await logAudit({
      entity: "InventoryDisposalEntry",
      entityId: entry._id,
      action: "create",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: {
        itemId: String(entry.itemId),
        containerId: String(entry.containerId),
        kind: entry.kind,
        quantity: entry.quantity,
        amount: entry.amount,
      },
    });

    return NextResponse.json({ entry: { id: String(entry._id) } });
  } catch (err) {
    if (err instanceof InventoryDisposalError) return jsonError(err.message, 400);
    console.error("POST /api/miniapp/inventory/disposals:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
