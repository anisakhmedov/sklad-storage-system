import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Складской инструмент/инвентарь (поддоны, ящики, рохля, кара и т.п.) — НЕ товар клиентов
 * (см. models/StorageRecord.ts), а собственное оборудование склада, которое можно временно
 * выдавать арендатору (см. models/InventoryLedgerEntry.ts). Управление самими позициями (создание/переименование/
 * списание общего количества) — строго владелец (role === "owner"), см. app/api/inventory/route.ts
 * и app/api/inventory/ledger/route.ts. Исключение — app/api/miniapp/inventory/route.ts: там
 * подтверждённый сотрудник читает список позиций с остатком и оформляет выдачу/приём клиенту
 * (не может создавать/удалять сами позиции).
 *
 * containerId — у каждого холодильника СВОЙ инвентарь, не общий на всю компанию (по решению
 * владельца): пул поддонов/тары у одного контейнера не пересекается с другим. Помечено
 * необязательным на уровне схемы только для СТАРЫХ позиций, заведённых до этой доработки —
 * они требуют ручной привязки к контейнеру (см. app/dashboard/inventory/page.tsx, баннер
 * "не привязаны к контейнеру"); zod на входе (lib/validation.ts::inventoryItemCreateSchema)
 * требует containerId у ВСЕХ новых позиций.
 */
export interface IInventoryItem {
  _id: Types.ObjectId;
  name: string;
  quantity: number;
  unit: string;
  containerId?: Types.ObjectId;
  note?: string;
  updatedBy: string;
  updatedAt: Date;
  createdAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>({
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  unit: { type: String, trim: true, default: "шт." },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", index: true },
  note: { type: String, trim: true },
  updatedBy: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

InventoryItemSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const InventoryItem: Model<IInventoryItem> =
  models.InventoryItem || model<IInventoryItem>("InventoryItem", InventoryItemSchema);
