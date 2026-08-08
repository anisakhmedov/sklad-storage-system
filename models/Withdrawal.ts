import { Schema, model, models, Model, Types } from "mongoose";
import type { Unit } from "./StorageRecord";

// Списание/вывоз товара из контейнера. Доступно только владельцу/доверенным лицам.
export interface IWithdrawal {
  _id: Types.ObjectId;
  containerId: Types.ObjectId;
  productName: string;
  quantity: number;
  unit: Unit;
  note?: string;
  createdBy: string; // identifier веб-пользователя
  createdAt: Date;
}

const WithdrawalSchema = new Schema<IWithdrawal>({
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, enum: ["tonne", "kg", "box", "piece"], required: true },
  note: { type: String, trim: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Withdrawal: Model<IWithdrawal> =
  models.Withdrawal || model<IWithdrawal>("Withdrawal", WithdrawalSchema);
