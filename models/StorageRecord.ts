import { Schema, model, models, Model, Types } from "mongoose";

export type Unit = "tonne" | "kg" | "box" | "piece";
export type PaymentMethod = "cash" | "terminal" | "transfer";

export interface IGoodsOwner {
  fullName: string;
  phone: string;
  // ЧУВСТВИТЕЛЬНЫЕ ПЕРСОНАЛЬНЫЕ ДАННЫЕ.
  // TODO(prod): зашифровать поля passportData и pinfl на уровне приложения
  // (например, mongoose-field-encryption / mongoose-encryption с ключом из env),
  // сейчас хранятся в открытом виде — см. README, раздел "Безопасность".
  passportData: string;
  pinfl: string;
}

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

const GoodsOwnerSchema = new Schema<IGoodsOwner>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passportData: { type: String, required: true, trim: true },
    pinfl: { type: String, required: true, trim: true },
  },
  { _id: false }
);

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

export const StorageRecord: Model<IStorageRecord> =
  models.StorageRecord || model<IStorageRecord>("StorageRecord", StorageRecordSchema);
