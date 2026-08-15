import { connectDB } from "./db";
import { StorageRecord, Unit, PaymentMethod } from "@/models/StorageRecord";
import { Withdrawal } from "@/models/Withdrawal";
import { Container } from "@/models/Container";
import { Income } from "@/models/Income";
import { Types } from "mongoose";
import { PAYMENT_METHOD_LABELS } from "./labels";
import { getDebtsForClient } from "./debt";

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

/**
 * Суммы фактических оплат по способам оплаты за период — источник теперь Income
 * (models/Income.ts), а не StorageRecord: сумма оплаты больше не вводится при создании
 * записи, она поступает отдельно и когда угодно (см. README → «Тарифы, оплата и
 * задолженность»). Диапазон считается по дате фактического платежа (paidAt).
 */
export async function getPaymentsByMethod(range: ReportRange) {
  await connectDB();
  const rows = await Income.aggregate([
    { $match: { paidAt: { $gte: range.from, $lte: range.to } } },
    {
      $group: {
        _id: "$method",
        total: { $sum: "$amount" },
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
  recordId: string;
  productName: string;
  quantity: number;
  unit: Unit;
  tariff?: { type: string; rate: number };
  createdAt: Date;
  expectedEndDate?: Date;
  /** Запись закрыта ("товар забран", см. models/StorageRecord.ts::closedAt) — начисление
   * остановлено на эту дату. undefined — активна. */
  closedAt?: Date;
}

export interface GoodsOwnerSummaryContainer {
  containerId: string;
  containerName: string;
  items: GoodsOwnerSummaryItem[];
  lastDate: Date;
  since: Date;
  accrued: number;
  paid: number;
  balance: number;
}

export interface GoodsOwnerSummary {
  recordCount: number;
  containers: GoodsOwnerSummaryContainer[];
  totalAccrued: number;
  totalPaid: number;
  totalBalance: number;
  to: Date;
}

/**
 * Агрегирует ВСЕ StorageRecord физлиц с данным (уже нормализованным) телефоном — список
 * товаров по контейнерам плюс начисление/оплата/задолженность на сегодня (см. lib/debt.ts).
 * Используется для сводки в боте (см. lib/telegramBot.ts).
 *
 * Телефон — не идентификатор клиента (см. models/Client.ts): в принципе несколько РАЗНЫХ
 * клиентов могут иметь один телефон. Telegram при "поделиться контактом" даёт только номер, без
 * возможности узнать, кто из них пишет — поэтому здесь (и только здесь) сознательно
 * агрегируется по телефону, суммируя долг/оплаты всех клиентов с этим номером, как и раньше.
 */
export async function getGoodsOwnerSummary(phone: string): Promise<GoodsOwnerSummary> {
  await connectDB();
  const records = await StorageRecord.find({ "goodsOwner.type": "individual", "goodsOwner.phone": phone })
    .select("clientId")
    .lean();
  const clientIds = Array.from(new Set(records.map((r) => String(r.clientId))));

  const empty: GoodsOwnerSummary = { recordCount: 0, containers: [], totalAccrued: 0, totalPaid: 0, totalBalance: 0, to: new Date() };
  if (clientIds.length === 0) return empty;

  const summaries = (await Promise.all(clientIds.map((id) => getClientSummary(id)))).filter(
    (s): s is GoodsOwnerSummary => s !== null
  );
  if (summaries.length === 1) return summaries[0];

  // Несколько клиентов с одним телефоном — сливаем построчно по контейнеру (Telegram не может
  // отличить, кто из них пишет, см. комментарий выше).
  const containerMap = new Map<string, GoodsOwnerSummaryContainer>();
  for (const s of summaries) {
    for (const c of s.containers) {
      const existing = containerMap.get(c.containerId);
      if (existing) {
        existing.items.push(...c.items);
        existing.accrued += c.accrued;
        existing.paid += c.paid;
        existing.balance += c.balance;
        if (c.lastDate > existing.lastDate) existing.lastDate = c.lastDate;
        if (c.since < existing.since) existing.since = c.since;
      } else {
        containerMap.set(c.containerId, { ...c, items: [...c.items] });
      }
    }
  }
  const containers = Array.from(containerMap.values());
  const totalAccrued = containers.reduce((sum, c) => sum + c.accrued, 0);
  const totalPaid = containers.reduce((sum, c) => sum + c.paid, 0);
  return {
    recordCount: summaries.reduce((sum, s) => sum + s.recordCount, 0),
    containers,
    totalAccrued,
    totalPaid,
    totalBalance: totalAccrued - totalPaid,
    to: new Date(),
  };
}

/**
 * Сводка по одному клиенту (models/Client.ts) — опционально сужает выборку до определённых
 * контейнеров (для Mini App, где сотрудник видит только свои контейнеры, см.
 * lib/miniAuth.ts::allowedContainerIds). Используется разделом «Клиенты» в Mini App и
 * «Арендаторы» на веб-панели.
 */
export async function getClientSummary(
  clientId: string,
  opts: { containerIds?: string[] } = {}
): Promise<GoodsOwnerSummary | null> {
  if (!Types.ObjectId.isValid(clientId)) return null;
  await connectDB();

  const recordFilter: Record<string, unknown> = { clientId };
  if (opts.containerIds) recordFilter.containerId = { $in: opts.containerIds };

  const to = new Date();
  const [records, debts] = await Promise.all([
    StorageRecord.find(recordFilter)
      .sort({ createdAt: -1 })
      .populate<{ containerId: { _id: Types.ObjectId; name: string } }>("containerId", "name")
      .lean(),
    getDebtsForClient(clientId, to, opts.containerIds),
  ]);

  const debtByContainer = new Map(debts.map((d) => [d.containerId, d]));

  const containerMap = new Map<string, GoodsOwnerSummaryContainer>();
  for (const r of records) {
    const containerRef = r.containerId as unknown as { _id: Types.ObjectId; name: string } | null;
    const cid = containerRef ? String(containerRef._id) : "unknown";
    if (!containerMap.has(cid)) {
      const debt = debtByContainer.get(cid);
      containerMap.set(cid, {
        containerId: cid,
        containerName: containerRef?.name || "—",
        items: [],
        lastDate: r.createdAt,
        since: debt?.since || r.createdAt,
        accrued: debt?.accrued || 0,
        paid: debt?.paid || 0,
        balance: debt?.balance || 0,
      });
    }
    const entry = containerMap.get(cid)!;
    entry.items.push({
      recordId: String(r._id),
      productName: r.productName,
      quantity: r.quantity,
      unit: r.unit,
      tariff: r.tariff,
      createdAt: r.createdAt,
      expectedEndDate: r.expectedEndDate,
      closedAt: r.closedAt,
    });
    if (r.createdAt > entry.lastDate) entry.lastDate = r.createdAt;
  }

  const containers = Array.from(containerMap.values());
  const totalAccrued = containers.reduce((sum, c) => sum + c.accrued, 0);
  const totalPaid = containers.reduce((sum, c) => sum + c.paid, 0);

  return {
    recordCount: records.length,
    containers,
    totalAccrued,
    totalPaid,
    totalBalance: totalAccrued - totalPaid,
    to,
  };
}
