import { Schema, model, models, Model, Types } from "mongoose";
import type { GoodsOwnerType } from "./StorageRecord";

/**
 * Сгенерированный PDF-акт (приём/отдача товара, выдача/возврат инвентаря, выдача/приём ящиков)
 * — В ОТЛИЧИЕ от договора (lib/contract/contractService.ts, который никогда не хранится и
 * пересобирается на каждый запрос), акт хранится целиком (pdfBuffer) сразу при создании, чтобы
 * кнопка "Акты" на странице "Записи" (app/dashboard/records/page.tsx) могла открыть любой
 * прошлый акт мгновенно, без пересборки. Единая модель под все виды акта — рендерится общим
 * lib/contract/generateAct.ts, сохраняется через lib/contract/actPersistence.ts::createAndSaveAct.
 *
 * recordId заполнен только для kind "goods_*" (акт по конкретной StorageRecord); инвентарные и
 * ящичные акты привязаны к клиенту+контейнеру (ownerKey+containerId), а не к одной записи —
 * см. app/api/acts/route.ts, который ищет акты и по recordId, и по ownerKey+containerId.
 */
export type ActKind =
  | "goods_given"
  | "goods_returned"
  | "inventory_given"
  | "inventory_returned"
  | "box_given"
  | "box_returned";

export interface IAct {
  _id: Types.ObjectId;
  actNumber: string; // "12-2026", см. lib/counter.ts::getNextSequence(`act:${year}`)
  kind: ActKind;
  recordId?: Types.ObjectId;
  ownerKey: string;
  ownerLabel: string;
  ownerType: GoodsOwnerType;
  containerId: Types.ObjectId;
  containerName: string; // денормализовано — для списка без populate
  cellNumber?: number;
  itemLabel: string; // "Товар: Яблоки" / "Инвентарь: Поддоны" / "Ящики"
  changedQuantityText: string;
  totalQuantityText?: string;
  pdfBuffer: Buffer;
  filename: string;
  createdBy: string;
  createdByRole: "owner" | "employee";
  createdAt: Date;
}

const ActSchema = new Schema<IAct>({
  actNumber: { type: String, required: true },
  kind: {
    type: String,
    enum: ["goods_given", "goods_returned", "inventory_given", "inventory_returned", "box_given", "box_returned"],
    required: true,
  },
  recordId: { type: Schema.Types.ObjectId, ref: "StorageRecord" },
  ownerKey: { type: String, required: true, index: true },
  ownerLabel: { type: String, required: true, trim: true },
  ownerType: { type: String, enum: ["individual", "company"], required: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  containerName: { type: String, required: true, trim: true },
  cellNumber: { type: Number, min: 1, max: 8 },
  itemLabel: { type: String, required: true, trim: true },
  changedQuantityText: { type: String, required: true },
  totalQuantityText: { type: String },
  pdfBuffer: { type: Buffer, required: true },
  filename: { type: String, required: true },
  createdBy: { type: String, required: true },
  createdByRole: { type: String, enum: ["owner", "employee"], required: true },
  createdAt: { type: Date, default: Date.now },
});

// Кнопка "Акты" на записи (по recordId) и общий список по клиенту+контейнеру (инвентарь/ящики).
ActSchema.index({ recordId: 1 });
ActSchema.index({ ownerKey: 1, containerId: 1 });

export const Act: Model<IAct> = models.Act || model<IAct>("Act", ActSchema);
