import { Schema, model, models, Model, Types } from "mongoose";

export type EmployeeStatus = "pending" | "approved" | "rejected";

export interface IEmployee {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  telegramId: string;
  telegramUsername?: string;
  status: EmployeeStatus;
  /**
   * Список контейнеров, к которым у сотрудника есть доступ в Mini App. ПУСТОЙ МАССИВ (по
   * умолчанию) означает доступ ко ВСЕМ контейнерам — так уже одобренные до этой доработки
   * сотрудники не теряют доступ при деплое. Непустой массив сужает доступ только до
   * перечисленных контейнеров (см. lib/miniAuth.ts::employeeCanAccessContainer).
   */
  containerAccess: Types.ObjectId[];
  createdAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  telegramId: { type: String, required: true, unique: true, index: true },
  telegramUsername: { type: String },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  containerAccess: { type: [Schema.Types.ObjectId], ref: "Container", default: [] },
  createdAt: { type: Date, default: Date.now },
});

export const Employee: Model<IEmployee> =
  models.Employee || model<IEmployee>("Employee", EmployeeSchema);
