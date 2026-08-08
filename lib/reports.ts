import { connectDB } from "./db";
import { StorageRecord } from "@/models/StorageRecord";
import { Withdrawal } from "@/models/Withdrawal";
import { Container } from "@/models/Container";
import { Types } from "mongoose";

const UNITS = ["tonne", "kg", "box", "piece"] as const;

export interface ReportRange {
  from: Date;
  to: Date;
}

function emptyUnitRow() {
  return { tonne: 0, kg: 0, box: 0, piece: 0 };
}

/** Объём поступившего товара по месяцам, сгруппированный по единицам измерения. */
export async function getMonthlyVolume(range: ReportRange) {
  await connectDB();
  const rows = await StorageRecord.aggregate([
    { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          unit: "$unit",
        },
        total: { $sum: "$quantity" },
      },
    },
  ]);

  const byMonth = new Map<string, { month: string } & Record<string, number | string>>();
  for (const row of rows) {
    const key = `${row._id.year}-${String(row._id.month).padStart(2, "0")}`;
    if (!byMonth.has(key)) {
      byMonth.set(key, { month: key, ...emptyUnitRow() });
    }
    const entry = byMonth.get(key)!;
    entry[row._id.unit as string] = row.total;
  }

  return Array.from(byMonth.values()).sort((a, b) =>
    String(a.month).localeCompare(String(b.month))
  );
}

/** Загруженность (сумма поступившего товара) по контейнерам, сгруппированная по единицам. */
export async function getContainerLoad(range: ReportRange) {
  await connectDB();
  const rows = await StorageRecord.aggregate([
    { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
    {
      $group: {
        _id: { containerId: "$containerId", unit: "$unit" },
        total: { $sum: "$quantity" },
      },
    },
  ]);

  const containers = await Container.find().lean();
  const nameById = new Map(containers.map((c) => [String(c._id), c.name]));

  const byContainer = new Map<string, { container: string } & Record<string, number | string>>();
  for (const row of rows) {
    const cid = String(row._id.containerId);
    if (!byContainer.has(cid)) {
      byContainer.set(cid, { container: nameById.get(cid) || cid, ...emptyUnitRow() });
    }
    const entry = byContainer.get(cid)!;
    entry[row._id.unit as string] = row.total;
  }

  return Array.from(byContainer.values());
}

/** Суммы оплат по способам оплаты. */
export async function getPaymentsByMethod(range: ReportRange) {
  await connectDB();
  const rows = await StorageRecord.aggregate([
    { $match: { createdAt: { $gte: range.from, $lte: range.to } } },
    {
      $group: {
        _id: "$payment.method",
        total: { $sum: "$payment.amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const labels: Record<string, string> = {
    cash: "Наличные",
    terminal: "Терминал",
    transfer: "Перевод",
  };

  return rows.map((r) => ({
    method: labels[r._id as string] || r._id,
    amount: r.total,
    count: r.count,
  }));
}

/** Текущий остаток по каждому контейнеру: приход минус списание, по каждой единице измерения. */
export async function getContainerBalances() {
  await connectDB();
  const containers = await Container.find().sort({ name: 1 }).lean();

  const incoming = await StorageRecord.aggregate([
    { $group: { _id: { containerId: "$containerId", unit: "$unit" }, total: { $sum: "$quantity" } } },
  ]);
  const outgoing = await Withdrawal.aggregate([
    { $group: { _id: { containerId: "$containerId", unit: "$unit" }, total: { $sum: "$quantity" } } },
  ]);

  const balanceMap = new Map<string, Record<(typeof UNITS)[number], number>>();
  const ensure = (cid: string) => {
    if (!balanceMap.has(cid)) {
      balanceMap.set(cid, { tonne: 0, kg: 0, box: 0, piece: 0 });
    }
    return balanceMap.get(cid)!;
  };

  for (const row of incoming) {
    const cid = String(row._id.containerId);
    ensure(cid)[row._id.unit as (typeof UNITS)[number]] += row.total;
  }
  for (const row of outgoing) {
    const cid = String(row._id.containerId);
    ensure(cid)[row._id.unit as (typeof UNITS)[number]] -= row.total;
  }

  return containers.map((c) => ({
    containerId: String(c._id),
    name: c.name,
    balances: balanceMap.get(String(c._id)) || emptyUnitRow(),
  }));
}
