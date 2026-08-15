import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { InventoryItem } from "@/models/InventoryItem";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryItemCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getOutstandingByAllItems, itemAvailability } from "@/lib/inventoryLedger";

/**
 * Складской инвентарь (поддоны/ящики/рохля/кара) — строго владелец, см. models/InventoryItem.ts.
 * `quantity` на позиции — это ОБЩЕЕ количество, которым владеет склад; `outstanding` — сколько
 * сейчас на руках у клиентов (см. models/InventoryLedgerEntry.ts); `available` — свободный
 * остаток на складе (quantity − outstanding), показывается рядом с общим количеством в
 * components/dashboard/InventoryPanel.tsx.
 *
 * У каждого контейнера свой инвентарь (см. models/InventoryItem.ts::containerId) —
 * `?containerId=` сужает список; `?unassigned=1` — наоборот, только СТАРЫЕ позиции без
 * контейнера (заведены до этой доработки), для баннера привязки на странице "Инвентарь". Без
 * параметров — все позиции сразу (нужно для быстрого виджета на "Обзоре", где показывается
 * общая картина).
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  if (sp.get("containerId")) filter.containerId = sp.get("containerId");
  if (sp.get("unassigned")) filter.containerId = { $exists: false };

  const [items, outstandingByItem] = await Promise.all([
    InventoryItem.find(filter).sort({ name: 1 }).lean(),
    getOutstandingByAllItems(),
  ]);
  const withAvailability = items.map((item) => ({
    ...item,
    ...itemAvailability(item.quantity, outstandingByItem.get(String(item._id)) || 0),
  }));
  return NextResponse.json({ items: withAvailability });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = inventoryItemCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const item = await InventoryItem.create({ ...parsed.data, updatedBy: user.identifier });

  await logAudit({
    entity: "InventoryItem",
    entityId: item._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: item.name, quantity: item.quantity },
  });

  return NextResponse.json({ item });
}
