import { Schema, model, models, Model, Types } from "mongoose";
import type { PaymentMethod } from "./StorageRecord";

/**
 * Расход (снятие владельцем себе, зарплата сотруднику, прочее) — отдельно от Withdrawal
 * (models/Withdrawal.ts, списание ТОВАРА со склада). Если расход создаёт владелец на сайте —
 * статус сразу "approved" и сумма учитывается в остатке (см. lib/finance.ts). Если создаёт
 * сотрудник (Mini App) — статус "pending", висит на одобрении и не влияет на остаток, пока
 * владелец не подтвердит на веб-панели (см. app/api/expenses/[id]/route.ts).
 */
export type ExpenseType = "owner_withdrawal" | "salary" | "other";
export type ExpenseStatus = "pending" | "approved" | "rejected";

export interface IExpense {
  _id: Types.ObjectId;
  type: ExpenseType;
  amount: number;
  method: PaymentMethod;
  note?: string;
  employeeName?: string; // для type "salary" — кому выплачено
  createdBy: string; // identifier веб-пользователя либо имя сотрудника (Mini App)
  createdByRole: "owner" | "employee";
  status: ExpenseStatus;
  approvedBy?: string;
  approvedAt?: Date;
  createdAt: Date;
}

const ExpenseSchema = new Schema<IExpense>({
  type: { type: String, enum: ["owner_withdrawal", "salary", "other"], required: true },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ["cash", "terminal", "transfer", "card"], required: true },
  note: { type: String, trim: true },
  employeeName: { type: String, trim: true },
  createdBy: { type: String, required: true },
  createdByRole: { type: String, enum: ["owner", "employee"], required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export const Expense: Model<IExpense> = models.Expense || model<IExpense>("Expense", ExpenseSchema);
