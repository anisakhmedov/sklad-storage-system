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
  /** Камера контейнера, за которую платит арендатор (1–8) — необязательно, для платежей "за
   * контейнер в целом" (напр. когда груз занимает несколько камер) поле не указывается. Нужно
   * для разбивки оплат по холодильникам и камерам на странице "Оплаты", см. lib/finance.ts::
   * getIncomeBreakdown. */
  cellNumber?: number;
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
  cellNumber: { type: Number, min: 1, max: 8 },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"], required: true },
  paidAt: { type: Date, required: true, default: Date.now },
  note: { type: String, trim: true },
  recordedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

IncomeSchema.index({ ownerKey: 1, containerId: 1 });

export const Income: Model<IIncome> = models.Income || model<IIncome>("Income", IncomeSchema);
