import { Schema, model, models, Model, Types } from "mongoose";
import type { PaymentMethod } from "./StorageRecord";

/**
 * «Приход на холодильник» — общий приход, НЕ привязанный к конкретному арендатору (в отличие от
 * models/Income.ts, где clientId обязателен). Вносит только владелец, только с веб-панели (см.
 * app/api/general-income/route.ts) — попадает в кассу, если method === "cash" (см. lib/finance.ts).
 *
 * containerId — к какому именно холодильнику относится этот приход (по решению владельца,
 * "абсолютно всё должно быть привязано к каждому контейнеру" — см. lib/finance.ts::getFinanceByContainer).
 * Помечено необязательным на уровне схемы только для записей, заведённых до этой доработки —
 * они попадают в отчёте по контейнерам отдельной строкой "Без привязки к контейнеру"; zod на
 * входе (lib/validation.ts::generalIncomeCreateSchema) требует containerId у ВСЕХ новых записей.
 */
export interface IGeneralIncome {
  _id: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  containerId?: Types.ObjectId;
  note?: string;
  paidAt: Date;
  recordedBy: string; // identifier веб-пользователя (всегда владелец)
  createdAt: Date;
}

const GeneralIncomeSchema = new Schema<IGeneralIncome>({
  amount: { type: Number, required: true, min: 0 },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", index: true },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"], required: true },
  note: { type: String, trim: true },
  paidAt: { type: Date, required: true, default: Date.now },
  recordedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const GeneralIncome: Model<IGeneralIncome> =
  models.GeneralIncome || model<IGeneralIncome>("GeneralIncome", GeneralIncomeSchema);
