import { Schema, model, models, Model, Types } from "mongoose";
import type { GoodsOwnerType } from "./StorageRecord";
import { MAX_CELL_COUNT } from "@/lib/cells";

/**
 * Учёт складского инвентаря (models/InventoryItem.ts — поддоны/ящики/рохля/кара и т.п.),
 * выданного конкретному арендатору и подлежащего возврату — без ставки/стоимости, это просто
 * складской инструмент, временно переданный клиенту. Баланс по
 * позиции = Σ(direction: "given") − Σ(direction: "returned") по itemId, см. lib/inventoryLedger.ts.
 * Остаток на складе = InventoryItem.quantity (общее количество) − текущий баланс выданного.
 *
 * containerId/cellNumber — где физически находится клиент, которому выдан инвентарь (не сам
 * инвентарь не привязан к контейнеру постоянно — это метаданные операции выдачи, нужны для
 * страницы "Инвентарь" — приход/уход по контейнеру и камере, см. app/dashboard/inventory).
 *
 * actId — ссылка на сгенерированный PDF-акт (models/Act.ts, kind: inventory_given/inventory_returned),
 * заполняется сразу после создания записи в app/api/miniapp/inventory/route.ts.
 */
export type InventoryLedgerDirection = "given" | "returned";

export interface IInventoryLedgerEntry {
  _id: Types.ObjectId;
  itemId: Types.ObjectId;
  itemName: string; // денормализовано на момент операции — для отображения без join
  /** Ключ агрегации (models/Client.ts) — см. пояснение в models/Income.ts. */
  clientId: Types.ObjectId;
  ownerKey: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  containerId: Types.ObjectId;
  cellNumber?: number;
  direction: InventoryLedgerDirection;
  quantity: number;
  actId?: Types.ObjectId;
  createdBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App)
  createdByRole: "owner" | "employee";
  createdAt: Date;
}

const InventoryLedgerEntrySchema = new Schema<IInventoryLedgerEntry>({
  itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
  itemName: { type: String, required: true, trim: true },
  clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
  ownerKey: { type: String, required: true, index: true },
  ownerType: { type: String, enum: ["individual", "company"], required: true },
  ownerLabel: { type: String, required: true, trim: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  cellNumber: { type: Number, min: 1, max: MAX_CELL_COUNT },
  direction: { type: String, enum: ["given", "returned"], required: true },
  quantity: { type: Number, required: true, min: 0 },
  actId: { type: Schema.Types.ObjectId, ref: "Act" },
  createdBy: { type: String, required: true },
  createdByRole: { type: String, enum: ["owner", "employee"], required: true },
  createdAt: { type: Date, default: Date.now },
});

// Ускоряет остаток по позиции (lib/inventoryLedger.ts::getOutstandingByItem) и страницу
// "Инвентарь" (фильтр по контейнеру/камере, см. app/api/inventory/ledger/route.ts).
InventoryLedgerEntrySchema.index({ itemId: 1, createdAt: 1 });
InventoryLedgerEntrySchema.index({ containerId: 1, cellNumber: 1 });

export const InventoryLedgerEntry: Model<IInventoryLedgerEntry> =
  models.InventoryLedgerEntry || model<IInventoryLedgerEntry>("InventoryLedgerEntry", InventoryLedgerEntrySchema);
