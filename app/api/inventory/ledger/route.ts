import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { InventoryLedgerEntry } from "@/models/InventoryLedgerEntry";
import { InventoryItem } from "@/models/InventoryItem";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryLedgerEntryCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getOutstandingByAllItems, itemAvailability, getInventoryOutstandingForOwner } from "@/lib/inventoryLedger";
import { createAndSaveAct } from "@/lib/contract/actPersistence";

/**
 * Приход/уход инвентаря по каждому контейнеру и камере — страница app/dashboard/inventory.
 * "given" (клиент забрал) / "returned" (клиент вернул на склад) фильтруются по контейнеру и
 * камере, см. models/InventoryLedgerEntry.ts. Владелец-only — как и весь остальной инвентарь
 * (см. models/InventoryItem.ts, app/api/inventory/route.ts), чтобы доверенное лицо не видело
 * движения инвентаря через этот роут, раз сам список позиций ему не отдаётся.
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const containerId = sp.get("containerId");
  if (containerId) filter.containerId = containerId;
  const cellNumber = sp.get("cellNumber");
  if (cellNumber) filter.cellNumber = Number(cellNumber);

  const entries = await InventoryLedgerEntry.find(filter)
    .sort({ createdAt: -1 })
    .populate("containerId", "name")
    .limit(500)
    .lean();

  return NextResponse.json({ entries });
}

/** Выдать/принять инвентарь клиенту с веб-панели (владелец) — тот же механизм, что и в Mini App. */
export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = inventoryLedgerEntryCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const [container, item] = await Promise.all([
    Container.findById(parsed.data.containerId),
    InventoryItem.findById(parsed.data.itemId),
  ]);
  if (!container) return jsonError("Контейнер не найден", 404);
  if (!item) return jsonError("Позиция инвентаря не найдена", 404);
  if (item.containerId && String(item.containerId) !== parsed.data.containerId) {
    return jsonError("Эта позиция принадлежит другому контейнеру", 400);
  }

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
    createdBy: user.identifier,
    createdByRole: "owner",
  });

  await logAudit({
    entity: "InventoryLedgerEntry",
    entityId: entry._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: {
      itemId: String(entry.itemId),
      ownerKey: entry.ownerKey,
      containerId: String(entry.containerId),
      direction: entry.direction,
      quantity: entry.quantity,
    },
  });

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
    createdBy: user.identifier,
    createdByRole: "owner",
  });
  entry.actId = act._id;
  await entry.save();

  return NextResponse.json({ entry: { id: String(entry._id) }, actId: String(act._id) });
}
