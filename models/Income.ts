import { Schema, model, models, Model, Types } from "mongoose";
import type { GoodsOwnerType, PaymentMethod } from "./StorageRecord";

/**
 * Фактически полученная оплата за хранение — отдельная от StorageRecord сущность, потому
 * что арендатор платит не сразу и не обязательно всю сумму целиком (см. README →
 * «Тарифы, оплата и задолженность»). StorageRecord.tariff фиксирует ДОГОВОРЁННЫЕ УСЛОВИЯ,
 * а Income — реальные поступления денег, из которых считается задолженность (lib/debt.ts).
 *
 * Привязка к арендатору — через ownerKey (см. lib/ownerKey.ts: нормализованный телефон для
 * физлиц, ИНН для юрлиц), а не через containerId+phone напрямую, чтобы одним и тем же
 * способом работать и для физлиц, и для юрлиц.
 */
export interface IIncome {
  _id: Types.ObjectId;
  ownerType: GoodsOwnerType;
  ownerKey: string;
  ownerLabel: string; // ФИО/наименование на момент платежа — для отображения без join по записям
  containerId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note?: string;
  recordedBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App), зафиксировавшего оплату
  createdAt: Date;
}

const IncomeSchema = new Schema<IIncome>({
  ownerType: { type: String, enum: ["individual", "company"], required: true },
  ownerKey: { type: String, required: true, index: true },
  ownerLabel: { type: String, required: true, trim: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer"], required: true },
  paidAt: { type: Date, required: true, default: Date.now },
  note: { type: String, trim: true },
  recordedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

IncomeSchema.index({ ownerKey: 1, containerId: 1 });

export const Income: Model<IIncome> = models.Income || model<IIncome>("Income", IncomeSchema);
