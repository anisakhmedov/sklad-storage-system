import { Schema, model, models, Model, Types } from "mongoose";

export type Unit = "tonne" | "kg" | "box" | "piece";
export type PaymentMethod = "cash" | "terminal" | "transfer";
export type GoodsOwnerType = "individual" | "company";

/**
 * Арендатор — физическое лицо. Паспортные данные и ПИНФЛ хранятся ОТКРЫТЫМ текстом
 * (намеренно, начиная с части 3 ТЗ): они подставляются напрямую в текст договора
 * (см. lib/contract/generateContract.ts), поэтому шифрование на уровне поля здесь
 * не применяется. Раньше это место было помечено TODO(prod) на шифрование — решение
 * отменено, см. README → «Безопасность».
 */
export interface IGoodsOwnerIndividual {
  type: "individual";
  fullName: string;
  phone: string;
  passportData: string;
  pinfl: string;
  /** Строка в свободном формате даты (напр. "12.05.2020") — как в паспорте/документе. */
  passportIssueDate: string;
  passportIssuedBy: string;
}

/** Арендатор — юридическое лицо. Договор для юрлиц не формируется (см. README). */
export interface IGoodsOwnerCompany {
  type: "company";
  companyName: string;
  inn: string;
  directorName: string;
}

export type IGoodsOwner = IGoodsOwnerIndividual | IGoodsOwnerCompany;

export interface IPayment {
  amount: number;
  method: PaymentMethod;
}

export interface IStorageRecord {
  _id: Types.ObjectId;
  containerId: Types.ObjectId;
  productName: string;
  quantity: number;
  unit: Unit;
  goodsOwner: IGoodsOwner;
  payment: IPayment;
  createdByEmployeeId: Types.ObjectId;
  createdAt: Date;
  editedBy?: string;
  editedAt?: Date;
}

// Единая гибкая Mongoose-схема на оба варианта goodsOwner (Mongoose не умеет нативно
// дискриминировать вложенный — не top-level — поддокумент по значению). Обязательность
// полей по типу проверяется в pre("validate") ниже; основную проверку формы делает zod
// на уровне API (lib/validation.ts, storageRecordCreateSchema) — как и везде в проекте,
// API не доверяет клиенту, а модель — второй рубеж защиты.
const GoodsOwnerSchema = new Schema<IGoodsOwner>(
  {
    type: { type: String, enum: ["individual", "company"], required: true },
    // — физическое лицо —
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    passportData: { type: String, trim: true },
    pinfl: { type: String, trim: true },
    passportIssueDate: { type: String, trim: true },
    passportIssuedBy: { type: String, trim: true },
    // — юридическое лицо —
    companyName: { type: String, trim: true },
    inn: { type: String, trim: true },
    directorName: { type: String, trim: true },
  },
  { _id: false }
);

GoodsOwnerSchema.pre("validate", function (next) {
  const owner = this as unknown as IGoodsOwner;
  if (owner.type === "individual") {
    const o = owner as IGoodsOwnerIndividual;
    if (!o.fullName || !o.phone || !o.passportData || !o.pinfl || !o.passportIssueDate || !o.passportIssuedBy) {
      return next(
        new Error(
          "Для физического лица обязательны: ФИО, телефон, номер паспорта, ПИНФЛ, дата выдачи, кем выдан"
        )
      );
    }
  } else if (owner.type === "company") {
    const o = owner as IGoodsOwnerCompany;
    if (!o.companyName || !o.inn || !o.directorName) {
      return next(new Error("Для юридического лица обязательны: наименование фирмы, ИНН, ФИО директора"));
    }
  } else {
    return next(new Error("Не указан тип арендатора (type: individual | company)"));
  }
  next();
});

const PaymentSchema = new Schema<IPayment>(
  {
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ["cash", "terminal", "transfer"], required: true },
  },
  { _id: false }
);

const StorageRecordSchema = new Schema<IStorageRecord>({
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, enum: ["tonne", "kg", "box", "piece"], required: true },
  goodsOwner: { type: GoodsOwnerSchema, required: true },
  payment: { type: PaymentSchema, required: true },
  createdByEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  editedBy: { type: String },
  editedAt: { type: Date },
});

// Договор формируется только для физлиц — индекс ускоряет поиск по телефону
// (уведомления, сводка и запрос договора владельцем груза, см. lib/telegramBot.ts).
StorageRecordSchema.index({ "goodsOwner.type": 1, "goodsOwner.phone": 1 });

export const StorageRecord: Model<IStorageRecord> =
  models.StorageRecord || model<IStorageRecord>("StorageRecord", StorageRecordSchema);
