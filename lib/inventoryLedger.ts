import { Types } from "mongoose";
import { connectDB } from "./db";
import { InventoryLedgerEntry, IInventoryLedgerEntry } from "@/models/InventoryLedgerEntry";
import { InventoryItem } from "@/models/InventoryItem";
// Побочный эффект: регистрирует схему "Container" до populate() ниже (см. пояснение в
// lib/contract/contractService.ts).
import "@/models/Container";

export interface InventoryBalance {
  itemId: string;
  itemName: string;
  clientId: string;
  ownerKey: string;
  ownerType: IInventoryLedgerEntry["ownerType"];
  ownerLabel: string;
  containerId: string;
  containerName: string;
  cellNumber?: number;
  outstanding: number;
  lastActivity: Date;
}

/**
 * Сколько единиц позиции сейчас на руках у клиентов (не возвращено на склад) — по всем
 * клиентам суммарно. Остаток на складе = InventoryItem.quantity − getOutstandingByItem(itemId).
 */
export async function getOutstandingByItem(itemId: string): Promise<number> {
  await connectDB();
  const rows = await InventoryLedgerEntry.aggregate([
    { $match: { itemId: new Types.ObjectId(itemId) } },
    {
      $group: {
        _id: null,
        given: { $sum: { $cond: [{ $eq: ["$direction", "given"] }, "$quantity", 0] } },
        returned: { $sum: { $cond: [{ $eq: ["$direction", "returned"] }, "$quantity", 0] } },
      },
    },
  ]);
  if (rows.length === 0) return 0;
  return Math.max(0, rows[0].given - rows[0].returned);
}

/** Остаток "на руках у клиентов" сразу для всех позиций инвентаря — одним запросом. */
export async function getOutstandingByAllItems(): Promise<Map<string, number>> {
  await connectDB();
  const rows = await InventoryLedgerEntry.aggregate([
    {
      $group: {
        _id: "$itemId",
        given: { $sum: { $cond: [{ $eq: ["$direction", "given"] }, "$quantity", 0] } },
        returned: { $sum: { $cond: [{ $eq: ["$direction", "returned"] }, "$quantity", 0] } },
      },
    },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r._id), Math.max(0, r.given - r.returned));
  return map;
}

/**
 * Сколько единиц позиции сейчас на руках у КОНКРЕТНОГО клиента в конкретном контейнере —
 * верхняя граница для direction "returned" (см. app/api/inventory/ledger/route.ts,
 * app/api/miniapp/inventory/route.ts): нельзя принять от клиента больше, чем у него реально
 * есть, иначе остаток по связке уходит в минус без физического смысла (существовавшая раньше
 * проверка была только на "given" — на весь свободный остаток склада, а не на "returned").
 */
export async function getInventoryOutstandingForOwner(
  clientId: string,
  itemId: string,
  containerId: string
): Promise<number> {
  const balances = await getAllInventoryBalances(clientId);
  return balances.find((b) => b.itemId === itemId && b.containerId === containerId)?.outstanding || 0;
}

/**
 * Баланс инвентаря по каждой связке клиент+позиция+контейнер — для страницы "Инвентарь" и
 * профиля клиента.
 */
export async function getAllInventoryBalances(clientId?: string): Promise<InventoryBalance[]> {
  await connectDB();
  const filter = clientId ? { clientId } : {};
  const entries = (await InventoryLedgerEntry.find(filter)
    .sort({ createdAt: 1 })
    .populate("containerId", "name")
    .lean()) as unknown as (IInventoryLedgerEntry & { containerId: { _id: unknown; name: string } | null })[];

  const groups = new Map<string, InventoryBalance>();
  for (const e of entries) {
    const containerRef = e.containerId as { _id: unknown; name: string } | null;
    const containerId = String(containerRef?._id ?? e.containerId);
    const key = `${String(e.clientId)}::${String(e.itemId)}::${containerId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        itemId: String(e.itemId),
        itemName: e.itemName,
        clientId: String(e.clientId),
        ownerKey: e.ownerKey,
        ownerType: e.ownerType,
        ownerLabel: e.ownerLabel,
        containerId,
        containerName: containerRef?.name || "—",
        cellNumber: e.cellNumber,
        outstanding: 0,
        lastActivity: e.createdAt,
      });
    }
    const g = groups.get(key)!;
    g.outstanding += e.direction === "given" ? e.quantity : -e.quantity;
    g.ownerLabel = e.ownerLabel;
    g.cellNumber = e.cellNumber ?? g.cellNumber;
    if (e.createdAt > g.lastActivity) g.lastActivity = e.createdAt;
  }

  return Array.from(groups.values())
    .filter((g) => g.outstanding !== 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

/** Общий/выданный/остаток по одной позиции — используется в GET /api/inventory. */
export function itemAvailability(itemQuantity: number, outstanding: number) {
  return { total: itemQuantity, outstanding, available: Math.max(0, itemQuantity - outstanding) };
}

export async function getInventoryItemOr404(itemId: string) {
  await connectDB();
  return InventoryItem.findById(itemId);
}
