import { Schema, model, models, Model, Types } from "mongoose";
import type { GoodsOwnerType } from "./StorageRecord";

/**
 * Учёт ящиков, выданных клиенту (под товар) и подлежащих возврату — отдельно от товарного
 * учёта (StorageRecord), т.к. ящики не расходуются, а одалживаются и должны вернуться.
 * Баланс = Σ(direction: "given") − Σ(direction: "returned") по ownerKey (см. lib/boxes.ts).
 * ratePerBox фиксируется на КАЖДОЙ операции (а не берётся глобально), чтобы прошлые операции
 * не "переписывались" при изменении текущей ставки.
 */
export type BoxDirection = "given" | "returned";

export interface IBoxLedgerEntry {
  _id: Types.ObjectId;
  ownerKey: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  containerId: Types.ObjectId;
  direction: BoxDirection;
  quantity: number;
  ratePerBox: number;
  actId?: Types.ObjectId; // ссылка на сгенерированный PDF-акт, см. models/Act.ts
  createdBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App)
  createdByRole: "employee" | "web";
  createdAt: Date;
}

const BoxLedgerEntrySchema = new Schema<IBoxLedgerEntry>({
  ownerKey: { type: String, required: true, index: true },
  ownerType: { type: String, enum: ["individual", "company"], required: true },
  ownerLabel: { type: String, required: true, trim: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  direction: { type: String, enum: ["given", "returned"], required: true },
  quantity: { type: Number, required: true, min: 0 },
  ratePerBox: { type: Number, required: true, min: 0 },
  actId: { type: Schema.Types.ObjectId, ref: "Act" },
  createdBy: { type: String, required: true },
  createdByRole: { type: String, enum: ["employee", "web"], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const BoxLedgerEntry: Model<IBoxLedgerEntry> =
  models.BoxLedgerEntry || model<IBoxLedgerEntry>("BoxLedgerEntry", BoxLedgerEntrySchema);
