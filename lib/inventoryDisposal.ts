import { connectDB } from "./db";
import { InventoryItem } from "@/models/InventoryItem";
import { InventoryDisposalEntry, InventoryDisposalKind } from "@/models/InventoryDisposalEntry";
// Побочный эффект: регистрирует схему "Container" до populate() в getInventoryDisposals ниже
// (см. пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import { getOutstandingByAllItems, itemAvailability } from "./inventoryLedger";
import { PaymentMethod } from "@/models/StorageRecord";

export class InventoryDisposalError extends Error {}

/**
 * Продажа/списание инвентаря — списывает `quantity` с ОБЩЕГО количества позиции
 * (item.quantity), проверив, что этого хватает в СВОБОДНОМ остатке (не выданном клиентам, см.
 * lib/inventoryLedger.ts::itemAvailability). Бросает InventoryDisposalError с понятным текстом
 * вместо кода ошибки — вызывающий код (API-роут) сам решает, каким HTTP-статусом это обернуть.
 */
export async function createInventoryDisposal(params: {
  itemId: string;
  containerId: string;
  kind: InventoryDisposalKind;
  quantity: number;
  amount?: number;
  method?: PaymentMethod;
  note?: string;
  createdBy: string;
  createdByRole: "employee" | "owner" | "trusted";
}) {
  await connectDB();

  const item = await InventoryItem.findById(params.itemId);
  if (!item) throw new InventoryDisposalError("Позиция инвентаря не найдена");

  // Позиция, у которой уже проставлен containerId (не старая непривязанная), должна совпадать
  // с контейнером операции — иначе можно было бы "продать" инвентарь чужого холодильника.
  if (item.containerId && String(item.containerId) !== params.containerId) {
    throw new InventoryDisposalError("Эта позиция принадлежит другому контейнеру");
  }

  const outstanding = (await getOutstandingByAllItems()).get(String(item._id)) || 0;
  const { available } = itemAvailability(item.quantity, outstanding);
  if (params.quantity > available) {
    throw new InventoryDisposalError(`Недостаточно свободного остатка (доступно: ${available})`);
  }

  item.quantity -= params.quantity;
  await item.save();

  const entry = await InventoryDisposalEntry.create({
    itemId: item._id,
    itemName: item.name,
    containerId: params.containerId,
    kind: params.kind,
    quantity: params.quantity,
    amount: params.kind === "sale" ? params.amount : undefined,
    method: params.kind === "sale" ? params.method : undefined,
    note: params.note,
    createdBy: params.createdBy,
    createdByRole: params.createdByRole,
  });

  return entry;
}

export async function getInventoryDisposals(opts: { containerId?: string; kind?: InventoryDisposalKind } = {}) {
  await connectDB();
  const filter: Record<string, unknown> = {};
  if (opts.containerId) filter.containerId = opts.containerId;
  if (opts.kind) filter.kind = opts.kind;
  return InventoryDisposalEntry.find(filter)
    .sort({ createdAt: -1 })
    .populate("containerId", "name")
    .limit(500)
    .lean();
}
