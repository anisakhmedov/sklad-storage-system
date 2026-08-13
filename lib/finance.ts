import { connectDB } from "./db";
import { Income } from "@/models/Income";
import { GeneralIncome } from "@/models/GeneralIncome";
import { Expense } from "@/models/Expense";
import type { PaymentMethod } from "@/models/StorageRecord";

/**
 * Касса = только фактические наличные (см. README-обсуждение) — банковский перевод и карта
 * (П2П) в кассу не входят, но учитываются в «общем приходе».
 */
export const KASSA_METHODS: PaymentMethod[] = ["cash"];

export interface FinanceSummary {
  totalIncome: number; // Income + GeneralIncome, все способы
  /**
   * ЧИСТЫЙ остаток наличных "на руках" = наличный приход минус уже одобренные наличные
   * расходы (раньше здесь был валовый приход без вычета расходов — баг: карточка "Касса"
   * не уменьшалась при расходе наличными). Совпадает с getCashBalance() ниже.
   */
  kassa: number;
  cardTotal: number; // Income + GeneralIncome, method "card" (П2П) — валовый приход
  transferTotal: number; // Income + GeneralIncome, method "transfer" (банковский счёт) — валовый приход
  totalExpenses: number; // Expense со status "approved"
  salaryTotal: number; // Expense type "salary" со status "approved"
  balance: number; // totalIncome - totalExpenses
  pendingExpensesCount: number;
  ownerCashWithdrawn: number; // Expense type "owner_withdrawal", method "cash", status "approved"
}

/**
 * Чистый остаток "на руках" прямо сейчас ПО КОНКРЕТНОМУ способу оплаты (наличные/перевод/карта)
 * = весь приход этим способом (Income+GeneralIncome) минус уже одобренные расходы этим же
 * способом (Expense, status approved) — обобщение прежней getCashBalance() (которая проверяла
 * только "cash") на все способы: расход/снятие раньше можно было провести переводом или картой
 * на любую сумму без проверки остатка — уходило в минус без предупреждения, ограничивалась
 * только касса. Отдельным лёгким запросом (без остальных агрегаций getFinanceSummary), т.к.
 * вызывается на каждое создание/одобрение/правку расхода — см. app/api/expenses/route.ts,
 * app/api/miniapp/expenses/route.ts, app/api/expenses/[id]/route.ts.
 */
export async function getMethodBalance(method: PaymentMethod): Promise<number> {
  await connectDB();
  const [incomeIn, generalIncomeIn, expenseOut] = await Promise.all([
    Income.aggregate([{ $match: { method } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    GeneralIncome.aggregate([{ $match: { method } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    Expense.aggregate([
      { $match: { method, status: "approved" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);
  const total = (incomeIn[0]?.total || 0) + (generalIncomeIn[0]?.total || 0);
  const out = expenseOut[0]?.total || 0;
  return total - out;
}

/** Частный случай getMethodBalance("cash") — оставлен под старым именем, т.к. касса (наличные
 * "на руках") также используется как отдельное понятие в UI (FinanceSummary.kassa). */
export async function getCashBalance(): Promise<number> {
  return getMethodBalance("cash");
}

export interface IncomeBreakdownRow {
  containerId: string;
  containerName: string;
  cellNumber: number | null; // null = платежи "за контейнер в целом", без указания камеры
  total: number;
}

/**
 * Разбивка фактических платежей (Income) по холодильнику (контейнеру) и камере — для новой
 * секции "По холодильникам и камерам" на странице "Оплаты" (см. app/dashboard/income/page.tsx).
 * cellNumber заполнен не у всех Income (см. models/Income.ts) — платежи без камеры группируются
 * отдельной строкой с cellNumber: null.
 */
export async function getIncomeBreakdown(): Promise<IncomeBreakdownRow[]> {
  await connectDB();
  const rows = await Income.aggregate([
    {
      $group: {
        _id: { containerId: "$containerId", cellNumber: { $ifNull: ["$cellNumber", null] } },
        total: { $sum: "$amount" },
      },
    },
    {
      $lookup: {
        from: "containers",
        localField: "_id.containerId",
        foreignField: "_id",
        as: "container",
      },
    },
  ]);

  return rows
    .map((r) => ({
      containerId: String(r._id.containerId),
      containerName: r.container[0]?.name || "—",
      cellNumber: r._id.cellNumber ?? null,
      total: r.total,
    }))
    .sort((a, b) => a.containerName.localeCompare(b.containerName, "ru") || (a.cellNumber ?? 0) - (b.cellNumber ?? 0));
}

/** Сводка для карточек на странице «Оплаты» (см. app/dashboard/income/page.tsx). */
export async function getFinanceSummary(): Promise<FinanceSummary> {
  await connectDB();

  const [incomeAgg, generalIncomeAgg, expenseByTypeAgg, expenseByMethodAgg, pendingCount, ownerCashAgg] =
    await Promise.all([
      Income.aggregate([{ $group: { _id: "$method", total: { $sum: "$amount" } } }]),
      GeneralIncome.aggregate([{ $group: { _id: "$method", total: { $sum: "$amount" } } }]),
      Expense.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
      // Отдельная агрегация по способу — нужна, чтобы вычесть наличные расходы из кассы (см.
      // ниже), не полагаясь на то, что "type" и "method" агрегируются вместе.
      Expense.aggregate([
        { $match: { status: "approved" } },
        { $group: { _id: "$method", total: { $sum: "$amount" } } },
      ]),
      Expense.countDocuments({ status: "pending" }),
      Expense.aggregate([
        { $match: { type: "owner_withdrawal", method: "cash", status: "approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

  let totalIncome = 0;
  let cashIncome = 0;
  let cardTotal = 0;
  let transferTotal = 0;
  for (const row of [...incomeAgg, ...generalIncomeAgg]) {
    totalIncome += row.total;
    if (KASSA_METHODS.includes(row._id as PaymentMethod)) cashIncome += row.total;
    if (row._id === "card") cardTotal += row.total;
    if (row._id === "transfer") transferTotal += row.total;
  }

  let totalExpenses = 0;
  let salaryTotal = 0;
  for (const row of expenseByTypeAgg) {
    totalExpenses += row.total;
    if (row._id === "salary") salaryTotal = row.total;
  }

  let cashExpenses = 0;
  for (const row of expenseByMethodAgg) {
    if (row._id === "cash") cashExpenses = row.total;
  }

  return {
    totalIncome,
    kassa: cashIncome - cashExpenses,
    cardTotal,
    transferTotal,
    totalExpenses,
    salaryTotal,
    balance: totalIncome - totalExpenses,
    pendingExpensesCount: pendingCount,
    ownerCashWithdrawn: ownerCashAgg[0]?.total || 0,
  };
}
