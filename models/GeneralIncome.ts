import { Schema, model, models, Model, Types } from "mongoose";
import type { PaymentMethod } from "./StorageRecord";

/**
 * «Приход на холодильник» — общий приход, НЕ привязанный к конкретному арендатору/контейнеру
 * (в отличие от models/Income.ts, где ownerKey/containerId обязательны). Вносит только
 * владелец, только с веб-панели (см. app/api/general-income/route.ts) — попадает в кассу,
 * если method === "cash" (см. lib/finance.ts).
 */
export interface IGeneralIncome {
  _id: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  note?: string;
  paidAt: Date;
  recordedBy: string; // identifier веб-пользователя (всегда владелец)
  createdAt: Date;
}

const GeneralIncomeSchema = new Schema<IGeneralIncome>({
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"], required: true },
  note: { type: String, trim: true },
  paidAt: { type: Date, required: true, default: Date.now },
  recordedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const GeneralIncome: Model<IGeneralIncome> =
  models.GeneralIncome || model<IGeneralIncome>("GeneralIncome", GeneralIncomeSchema);
