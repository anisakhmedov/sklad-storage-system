import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Контейнер для ПЕРЕВОЗКИ — временный, выдаётся клиенту на время перевозки груза (не для
 * длительного хранения). В отличие от models/Container.ts (постоянный холодильный контейнер
 * с 8 камерами/обходами/договорами), у перевозочного контейнера нет камер, обходов, актов —
 * только простое состояние "занят/свободен". Когда клиент привёз груз и освободил ящики,
 * сотрудник просто отмечает его свободным — никакие PDF-документы не формируются (явное
 * требование ТЗ), см. app/api/transport-containers, app/api/miniapp/transport-containers.
 */
export type TransportContainerStatus = "in_use" | "free";

export interface ITransportContainer {
  _id: Types.ObjectId;
  label: string;
  status: TransportContainerStatus;
  currentOwnerLabel?: string;
  givenAt?: Date;
  freedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransportContainerSchema = new Schema<ITransportContainer>({
  label: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ["in_use", "free"], required: true, default: "free" },
  currentOwnerLabel: { type: String, trim: true },
  givenAt: { type: Date },
  freedAt: { type: Date },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TransportContainerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const TransportContainer: Model<ITransportContainer> =
  models.TransportContainer || model<ITransportContainer>("TransportContainer", TransportContainerSchema);
