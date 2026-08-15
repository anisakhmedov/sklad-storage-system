import { Schema, model, models, Model, Types } from "mongoose";
import type { GoodsOwnerType, PaymentMethod } from "./StorageRecord";
import { MAX_CELL_COUNT } from "@/lib/cells";

/**
 * Фактически полученная оплата за хранение — отдельная от StorageRecord сущность, потому
 * что арендатор платит не сразу и не обязательно всю сумму целиком (см. README →
 * «Тарифы, оплата и задолженность»). StorageRecord.tariff фиксирует ДОГОВОРЁННЫЕ УСЛОВИЯ,
 * а Income — реальные поступления денег, из которых считается задолженность (lib/debt.ts).
 *
 * Привязка к арендатору — через clientId (models/Client.ts), это ЕДИНСТВЕННЫЙ ключ агрегации.
 * ownerKey/ownerType/ownerLabel остаются денормализованными полями ТОЛЬКО для отображения без
 * join (напр. в списках/экспортах) — раньше (до models/Client.ts) они же были и ключом
 * агрегации, но телефон/ИНН не гарантированно уникален на человека (см. комментарий в
 * models/Client.ts), поэтому агрегировать по ним больше нельзя.
 */
export interface IIncome {
  _id: Types.ObjectId;
  clientId: Types.ObjectId;
  ownerType: GoodsOwnerType;
  ownerKey: string;
  ownerLabel: string; // ФИО/наименование на момент платежа — для отображения без join по записям
  containerId: Types.ObjectId;
  /** Камера контейнера, за которую платит арендатор (1–8). Обязательно для НОВЫХ платежей (см.
   * lib/validation.ts::incomeCreateSchema) — нужно для разбивки задолженности по камерам
   * (lib/debt.ts, lib/tenantMatrix.ts), а не только по контейнеру в целом. У платежей,
   * заведённых до этого требования, поля может не быть — такие платежи распределяются между
   * камерами клиента в этом контейнере автоматически (см. lib/debt.ts — FIFO по дате камеры). */
  cellNumber?: number;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note?: string;
  recordedBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App), зафиксировавшего оплату
  createdAt: Date;
}

const IncomeSchema = new Schema<IIncome>({
  clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },
  ownerType: { type: String, enum: ["individual", "company"], required: true },
  ownerKey: { type: String, required: true, index: true },
  ownerLabel: { type: String, required: true, trim: true },
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  cellNumber: { type: Number, min: 1, max: MAX_CELL_COUNT },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"], required: true },
  paidAt: { type: Date, required: true, default: Date.now },
  note: { type: String, trim: true },
  recordedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

IncomeSchema.index({ clientId: 1, containerId: 1 });

export const Income: Model<IIncome> = models.Income || model<IIncome>("Income", IncomeSchema);
