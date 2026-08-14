import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { InventoryItem } from "@/models/InventoryItem";
import { InventoryLedgerEntry } from "@/models/InventoryLedgerEntry";
import { Container } from "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryLedgerEntryCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getOutstandingByAllItems, itemAvailability, getInventoryOutstandingForOwner } from "@/lib/inventoryLedger";
import { createAndSaveAct } from "@/lib/contract/actPersistence";
import { sendActToEmployee } from "@/lib/telegramNotify";

/** Список позиций инвентаря с остатком — для формы выдачи/приёма в Mini App. */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    await connectDB();
    const [items, outstandingByItem] = await Promise.all([
      InventoryItem.find().sort({ name: 1 }).lean(),
      getOutstandingByAllItems(),
    ]);
    const withAvailability = items.map((item) => ({
      ...item,
      ...itemAvailability(item.quantity, outstandingByItem.get(String(item._id)) || 0),
    }));
    return NextResponse.json({ items: withAvailability });
  } catch (err) {
    console.error("GET /api/miniapp/inventory:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/**
 * Выдать инвентарь клиенту (арендатору) или принять его обратно — фиксирует операцию в
 * InventoryLedgerEntry (см. models/InventoryLedgerEntry.ts). PDF-акт "передачи инвентаря"
 * генерируется и сохраняется здесь же (см. lib/contract/actPersistence.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = inventoryLedgerEntryCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    await connectDB();
    const [container, item] = await Promise.all([
      Container.findById(parsed.data.containerId),
      InventoryItem.findById(parsed.data.itemId),
    ]);
    if (!container) return jsonError("Контейнер не найден", 404);
    if (!item) return jsonError("Позиция инвентаря не найдена", 404);

    if (parsed.data.direction === "given") {
      const outstanding = (await getOutstandingByAllItems()).get(String(item._id)) || 0;
      const { available } = itemAvailability(item.quantity, outstanding);
      if (parsed.data.quantity > available) {
        return jsonError(`Недостаточно свободного остатка (доступно: ${available})`, 400);
      }
    } else {
      const ownerOutstanding = await getInventoryOutstandingForOwner(
        parsed.data.ownerKey,
        String(item._id),
        parsed.data.containerId
      );
      if (parsed.data.quantity > ownerOutstanding) {
        return jsonError(`У клиента сейчас только ${ownerOutstanding} — нельзя принять больше`, 400);
      }
    }

    const entry = await InventoryLedgerEntry.create({
      itemId: item._id,
      itemName: item.name,
      ownerKey: parsed.data.ownerKey,
      ownerType: parsed.data.ownerType,
      ownerLabel: parsed.data.ownerLabel,
      containerId: parsed.data.containerId,
      cellNumber: parsed.data.cellNumber,
      direction: parsed.data.direction,
      quantity: parsed.data.quantity,
      createdBy: employee.name,
      createdByRole: "employee",
    });

    await logAudit({
      entity: "InventoryLedgerEntry",
      entityId: entry._id,
      action: "create",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: {
        itemId: String(entry.itemId),
        ownerKey: entry.ownerKey,
        containerId: String(entry.containerId),
        direction: entry.direction,
        quantity: entry.quantity,
      },
    });

    // "Акт передачи инвентаря" / "Акт возврата инвентаря" — сохраняется целиком и уходит
    // сотруднику в Telegram (best-effort), см. lib/contract/actPersistence.ts.
    const act = await createAndSaveAct({
      kind: entry.direction === "given" ? "inventory_given" : "inventory_returned",
      ownerKey: entry.ownerKey,
      ownerLabel: entry.ownerLabel,
      ownerType: entry.ownerType,
      containerId: String(entry.containerId),
      containerName: container.name,
      cellNumber: entry.cellNumber,
      itemLabel: entry.itemName,
      changedQuantityText: `${entry.quantity} ${item.unit}`,
      createdBy: employee.name,
      createdByRole: "employee",
    });
    entry.actId = act._id;
    await entry.save();
    await sendActToEmployee(employee.telegramId, act);

    return NextResponse.json({ entry: { id: String(entry._id) } });
  } catch (err) {
    console.error("POST /api/miniapp/inventory:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
