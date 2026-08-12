import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Складской инструмент/инвентарь (поддоны, ящики, рохля, кара и т.п.) — НЕ товар клиентов
 * (см. models/StorageRecord.ts) и не ящики под товар клиента (см. models/BoxLedgerEntry.ts),
 * а собственное оборудование склада. Доступ строго владельцу (role === "owner"), см.
 * app/api/inventory/route.ts.
 */
export interface IInventoryItem {
  _id: Types.ObjectId;
  name: string;
  quantity: number;
  unit: string;
  note?: string;
  updatedBy: string;
  updatedAt: Date;
  createdAt: Date;
}

const InventoryItemSchema = new Schema<IInventoryItem>({
  name: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0, default: 0 },
  unit: { type: String, trim: true, default: "шт." },
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
