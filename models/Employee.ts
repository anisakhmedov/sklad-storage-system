import { Schema, model, models, Model, Types } from "mongoose";

export type EmployeeStatus = "pending" | "approved" | "rejected";

export interface IEmployee {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  /**
   * Отсутствует у сотрудников, заведённых владельцем напрямую с веб-панели ("без доступа к
   * платформе" — см. hasPlatformAccess ниже, app/dashboard/employees/page.tsx): такой
   * сотрудник существует только для учёта (напр. зарплатных расходов), в Mini App/боте не
   * регистрируется и через lib/miniAuth.ts::resolveEmployee никогда не находится.
   */
  telegramId?: string;
  telegramUsername?: string;
  status: EmployeeStatus;
  /**
   * false — сотрудник заведён владельцем напрямую (см. telegramId выше) и не может пользоваться
   * ботом/Mini App вообще, даже если статус "approved". true (или отсутствует у сотрудников,
   * созданных до этой доработки) — обычный сотрудник, зарегистрировавшийся через бота.
   */
  hasPlatformAccess?: boolean;
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
  // sparse — у сотрудников "без доступа к платформе" поле отсутствует; без sparse обычный
  // unique-индекс считал бы все такие документы дублями друг друга по "отсутствующему" значению.
  telegramId: { type: String, unique: true, sparse: true, index: true },
  telegramUsername: { type: String },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  hasPlatformAccess: { type: Boolean, default: true },
  containerAccess: { type: [Schema.Types.ObjectId], ref: "Container", default: [] },
  createdAt: { type: Date, default: Date.now },
});

export const Employee: Model<IEmployee> =
  models.Employee || model<IEmployee>("Employee", EmployeeSchema);
