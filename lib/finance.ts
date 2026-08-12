import { connectDB } from "./db";
import { Income } from "@/models/Income";
import { GeneralIncome } from "@/models/GeneralIncome";
import { Expense } from "@/models/Expense";
import type { PaymentMethod } from "@/models/StorageRecord";

/**
 * Касса = только фактические наличные (см. README-обсуждение) — терминал, перечисление
 * (счёт-банк) и карта (счёт-карта) в кассу не входят, но учитываются в «общем приходе».
 */
export const KASSA_METHODS: PaymentMethod[] = ["cash"];

export interface FinanceSummary {
  totalIncome: number; // Income + GeneralIncome, все способы
  kassa: number; // Income + GeneralIncome, только KASSA_METHODS
  totalExpenses: number; // Expense со status "approved"
  salaryTotal: number; // Expense type "salary" со status "approved"
  balance: number; // totalIncome - totalExpenses
  pendingExpensesCount: number;
}

/** Сводка для новых карточек на странице «Оплаты» (см. app/dashboard/income/page.tsx). */
export async function getFinanceSummary(): Promise<FinanceSummary> {
  await connectDB();

  const [incomeAgg, generalIncomeAgg, expenseAgg, pendingCount] = await Promise.all([
    Income.aggregate([{ $group: { _id: "$method", total: { $sum: "$amount" } } }]),
    GeneralIncome.aggregate([{ $group: { _id: "$method", total: { $sum: "$amount" } } }]),
    Expense.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$type", total: { $sum: "$amount" } } },
    ]),
    Expense.countDocuments({ status: "pending" }),
  ]);

  let totalIncome = 0;
  let kassa = 0;
  for (const row of [...incomeAgg, ...generalIncomeAgg]) {
    totalIncome += row.total;
    if (KASSA_METHODS.includes(row._id as PaymentMethod)) kassa += row.total;
  }

  let totalExpenses = 0;
  let salaryTotal = 0;
  for (const row of expenseAgg) {
    totalExpenses += row.total;
    if (row._id === "salary") salaryTotal = row.total;
  }

  return {
    totalIncome,
    kassa,
    totalExpenses,
    salaryTotal,
    balance: totalIncome - totalExpenses,
    pendingExpensesCount: pendingCount,
  };
}
