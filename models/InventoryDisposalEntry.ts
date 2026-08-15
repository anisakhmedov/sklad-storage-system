import { Schema, model, models, Model, Types } from "mongoose";
import type { PaymentMethod } from "./StorageRecord";

/**
 * Продажа или списание складского инвентаря (см. models/InventoryItem.ts) — заменяет собой
 * прежний раздел "Контейнеры для перевозки" (убран полностью по решению владельца, см.
 * git-историю). Уменьшает СВОБОДНЫЙ остаток позиции (item.quantity), не трогая то, что сейчас
 * на руках у клиентов (см. lib/inventoryLedger.ts::itemAvailability) — нельзя продать/списать
 * то, что физически выдано и ещё не возвращено.
 *
 * "sale" — инвентарь ушёл клиенту насовсем за деньги (amount обязателен); "writeoff" — списан
 * без денег (порча, утеря и т.п.). В отличие от models/Income.ts/GeneralIncome.ts сумма продажи
 * хранится прямо на записи, а не заводит отдельный приход в кассе — это движение склада, а не
 * оплата аренды, смешивать их в общей кассе владелец не просил (можно добавить позже как
 * отдельную доработку, если понадобится).
 */
export type InventoryDisposalKind = "sale" | "writeoff";

export interface IInventoryDisposalEntry {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  itemName: string; // снимок названия на момент операции — переименование позиции не переписывает историю
  containerId: Types.ObjectId;
  kind: InventoryDisposalKind;
  quantity: number;
  /** Сумма выручки — только для kind: "sale". */
  amount?: number;
  method?: PaymentMethod;
  note?: string;
  createdBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App)
  createdByRole: "employee" | "owner" | "trusted";
  createdAt: Date;
}

const InventoryDisposalEntrySchema = new Schema<IInventoryDisposalEntry>({
  itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
  itemName: { type: String, required: true, trim: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  kind: { type: String, enum: ["sale", "writeoff"], required: true },
  quantity: { type: Number, required: true, min: 0 },
  amount: { type: Number, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"] },
  note: { type: String, trim: true },
  createdBy: { type: String, required: true },
  createdByRole: { type: String, enum: ["employee", "owner", "trusted"], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const InventoryDisposalEntry: Model<IInventoryDisposalEntry> =
  models.InventoryDisposalEntry || model<IInventoryDisposalEntry>("InventoryDisposalEntry", InventoryDisposalEntrySchema);
