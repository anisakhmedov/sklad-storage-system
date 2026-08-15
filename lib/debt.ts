import { connectDB } from "@/lib/db";
import { StorageRecord, GoodsOwnerType, ITariff, Unit } from "@/models/StorageRecord";
import { Income } from "@/models/Income";
// Побочный эффект: регистрирует схему "Container" до populate("containerId") ниже
// (см. пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import { accrueTariff } from "@/lib/tariff";
import { ownerKeyOf, ownerLabelOf, parseOwnerKey } from "@/lib/ownerKey";

/**
 * Задолженность = начислено по тарифу (сумма по всем записям владельца в этом контейнере,
 * с даты создания КАЖДОЙ записи по `to`) минус фактически оплачено (Income с paidAt ≤ `to`).
 * Если конечная дата не задана — берётся сегодня (см. README → «Тарифы, оплата и задолженность»).
 */
export interface DebtRecordBreakdown {
  recordId: string;
  productName: string;
  quantity: number;
  unit: Unit;
  tariff: ITariff;
  since: Date;
  accrued: number;
  /** Проставлена, если запись закрыта ("товар забран") — начисление остановлено на эту дату,
   * см. models/StorageRecord.ts::closedAt. undefined — запись активна. */
  closedAt?: Date;
}

export interface OwnerContainerDebt {
  ownerType: GoodsOwnerType;
  ownerKey: string;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  since: Date;
  to: Date;
  accrued: number;
  paid: number;
  balance: number;
  records: DebtRecordBreakdown[];
}

interface Group {
  ownerType: GoodsOwnerType;
  ownerKey: string;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  since: Date;
  records: DebtRecordBreakdown[];
}

/**
 * Все связки «владелец + контейнер» с начислением/оплатой/остатком на дату `to`.
 * `ownerKey` сужает выборку до одного владельца (по его телефону/ИНН) — используется ботом
 * и веб-панелью, когда не нужна сводка по всем сразу.
 */
export async function getAllOwnerContainerDebts(
  opts: { to?: Date; ownerKey?: string; containerIds?: string[] } = {}
): Promise<OwnerContainerDebt[]> {
  const to = opts.to || new Date();
  await connectDB();

  const recordFilter: Record<string, unknown> = {};
  if (opts.containerIds) {
    // Ограничение по доступным сотруднику контейнерам (см. lib/miniAuth.ts::allowedContainerIds).
    // undefined в opts.containerIds означает "без ограничения" — сюда попадает только массив.
    recordFilter.containerId = { $in: opts.containerIds };
  }
  if (opts.ownerKey) {
    const parsed = parseOwnerKey(opts.ownerKey);
    if (parsed?.type === "individual") {
      recordFilter["goodsOwner.type"] = "individual";
      recordFilter["goodsOwner.phone"] = parsed.value;
    } else if (parsed?.type === "company") {
      recordFilter["goodsOwner.type"] = "company";
      recordFilter["goodsOwner.inn"] = parsed.value;
    } else {
      // Некорректный ownerKey — заведомо пустой результат вместо всех записей подряд.
      return [];
    }
  }

  const records = await StorageRecord.find(recordFilter)
    .populate<{ containerId: { _id: unknown; name: string } }>("containerId", "name")
    .lean();

  const groups = new Map<string, Group>();
  for (const r of records as any[]) {
    const ownerKey = ownerKeyOf(r.goodsOwner);
    const containerRef = r.containerId as { _id: unknown; name: string } | null;
    const containerId = String(containerRef?._id ?? r.containerId);
    const groupKey = `${ownerKey}::${containerId}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        ownerType: r.goodsOwner.type,
        ownerKey,
        ownerLabel: ownerLabelOf(r.goodsOwner),
        containerId,
        containerName: containerRef?.name || "—",
        since: r.createdAt,
        records: [],
      });
    }
    const g = groups.get(groupKey)!;
    if (r.createdAt < g.since) g.since = r.createdAt;

    // Закрытая запись ("товар забран", см. models/StorageRecord.ts::closedAt) не начисляет
    // дальше closedAt, даже если запрошенная дата `to` позже — начисление "заморожено" на
    // момент закрытия. Если `to` раньше closedAt (смотрим задолженность на прошлую дату, когда
    // запись ещё была активна), ограничение не действует — берём саму `to`.
    const accrualTo = r.closedAt && r.closedAt < to ? r.closedAt : to;

    // Записи, созданные до появления поля "тариф" (ранние тестовые/сид-записи), не имеют
    // r.tariff — раньше это роняло весь расчёт задолженности исключением (Cannot read
    // properties of undefined) для ВСЕХ владельцев и контейнеров разом, из-за чего
    // /api/debts и /api/miniapp/debts отдавали ошибку, а фронтенд молча показывал "записей
    // нет" (см. диагностику бага). Такая запись просто не начисляет долг (accrued: 0),
    // а не ломает остальные.
    const accrued = r.tariff
      ? accrueTariff({
          type: r.tariff.type,
          rate: r.tariff.rate,
          quantity: r.quantity,
          unit: r.unit,
          from: r.createdAt,
          to: accrualTo,
        })
      : 0;
    g.records.push({
      recordId: String(r._id),
      productName: r.productName,
      quantity: r.quantity,
      unit: r.unit,
      tariff: r.tariff || { type: "per_day", rate: 0 },
      since: r.createdAt,
      accrued,
      closedAt: r.closedAt || undefined,
    });
  }

  const incomeFilter: Record<string, unknown> = { paidAt: { $lte: to } };
  if (opts.ownerKey) incomeFilter.ownerKey = opts.ownerKey;
  const incomes = await Income.find(incomeFilter).lean();

  const paidByGroup = new Map<string, number>();
  for (const inc of incomes) {
    const key = `${inc.ownerKey}::${String(inc.containerId)}`;
    paidByGroup.set(key, (paidByGroup.get(key) || 0) + inc.amount);
  }

  const result: OwnerContainerDebt[] = [];
  for (const [key, g] of groups) {
    const accrued = g.records.reduce((sum, r) => sum + r.accrued, 0);
    const paid = paidByGroup.get(key) || 0;
    result.push({
      ownerType: g.ownerType,
      ownerKey: g.ownerKey,
      ownerLabel: g.ownerLabel,
      containerId: g.containerId,
      containerName: g.containerName,
      since: g.since,
      to,
      accrued,
      paid,
      balance: accrued - paid,
      records: g.records.sort((a, b) => a.since.getTime() - b.since.getTime()),
    });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

export async function getOwnerContainerDebt(
  ownerKey: string,
  containerId: string,
  to: Date = new Date()
): Promise<OwnerContainerDebt | null> {
  const debts = await getAllOwnerContainerDebts({ to, ownerKey });
  return debts.find((d) => d.containerId === containerId) || null;
}

export async function getDebtsForOwner(
  ownerKey: string,
  to: Date = new Date(),
  containerIds?: string[]
): Promise<OwnerContainerDebt[]> {
  return getAllOwnerContainerDebts({ to, ownerKey, containerIds });
}
