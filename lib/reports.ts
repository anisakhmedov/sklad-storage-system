import { connectDB } from "./db";
import { StorageRecord, Unit, PaymentMethod } from "@/models/StorageRecord";
import { Withdrawal } from "@/models/Withdrawal";
import { Container } from "@/models/Container";
import { Types } from "mongoose";
import { PAYMENT_METHOD_LABELS } from "./labels";

export { PAYMENT_METHOD_LABELS };

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

  return rows.map((r) => ({
    method: PAYMENT_METHOD_LABELS[r._id as PaymentMethod] || r._id,
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

// ---------------------------------------------------------------------------
// Сводка для владельца груза (часть 2 ТЗ) — присылается ботом в чат по запросу
// (см. lib/goodsOwnerBot.ts). Договор формируется только для физлиц, поэтому и телефон
// для идентификации есть только у goodsOwner.type === "individual".
// ---------------------------------------------------------------------------

export interface GoodsOwnerSummaryItem {
  productName: string;
  quantity: number;
  unit: Unit;
}

export interface GoodsOwnerSummaryContainer {
  containerId: string;
  containerName: string;
  items: GoodsOwnerSummaryItem[];
  lastDate: Date;
}

export interface GoodsOwnerSummaryMethodTotal {
  method: string;
  amount: number;
}

export interface GoodsOwnerSummary {
  recordCount: number;
  containers: GoodsOwnerSummaryContainer[];
  totalAmount: number;
  byMethod: GoodsOwnerSummaryMethodTotal[];
}

/** Агрегирует все StorageRecord физлица с данным (уже нормализованным) телефоном. */
export async function getGoodsOwnerSummary(phone: string): Promise<GoodsOwnerSummary> {
  await connectDB();

  const records = await StorageRecord.find({ "goodsOwner.type": "individual", "goodsOwner.phone": phone })
    .sort({ createdAt: -1 })
    .populate<{ containerId: { _id: Types.ObjectId; name: string } }>("containerId", "name")
    .lean();

  const containerMap = new Map<string, GoodsOwnerSummaryContainer>();
  let totalAmount = 0;
  const methodTotals = new Map<PaymentMethod, number>();

  for (const r of records) {
    const containerRef = r.containerId as unknown as { _id: Types.ObjectId; name: string } | null;
    const cid = containerRef ? String(containerRef._id) : "unknown";
    if (!containerMap.has(cid)) {
      containerMap.set(cid, {
        containerId: cid,
        containerName: containerRef?.name || "—",
        items: [],
        lastDate: r.createdAt,
      });
    }
    const entry = containerMap.get(cid)!;
    entry.items.push({ productName: r.productName, quantity: r.quantity, unit: r.unit });
    if (r.createdAt > entry.lastDate) entry.lastDate = r.createdAt;

    totalAmount += r.payment.amount;
    methodTotals.set(r.payment.method, (methodTotals.get(r.payment.method) || 0) + r.payment.amount);
  }

  const byMethod = Array.from(methodTotals.entries()).map(([method, amount]) => ({
    method: PAYMENT_METHOD_LABELS[method] || method,
    amount,
  }));

  return {
    recordCount: records.length,
    containers: Array.from(containerMap.values()),
    totalAmount,
    byMethod,
  };
}
