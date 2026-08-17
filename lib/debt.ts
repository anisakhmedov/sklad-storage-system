import { connectDB } from "@/lib/db";
import { StorageRecord, GoodsOwnerType, ITariff, Unit } from "@/models/StorageRecord";
import { Income } from "@/models/Income";
// Побочный эффект: регистрирует схему "Container" до populate("containerId") ниже
// (см. пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import { accrueTariff } from "@/lib/tariff";
import { ownerLabelOf } from "@/lib/ownerKey";

/**
 * Задолженность = начислено по тарифу (сумма по всем записям клиента в этой КАМЕРЕ, с даты
 * создания КАЖДОЙ записи по `to`) минус фактически оплачено (Income с paidAt ≤ `to`).
 * Если конечная дата не задана — берётся сегодня (см. README → «Тарифы, оплата и задолженность»).
 *
 * Ключ агрегации — clientId (models/Client.ts), а не телефон/ИНН (см. историческое пояснение в
 * models/Client.ts): раньше два разных человека без своего телефона, вписанные с одним и тем
 * же "запасным" номером, автоматически считались одним арендатором.
 *
 * Детализация — до КАМЕРЫ (cellNumber), а не только до контейнера: начисление у каждой
 * StorageRecord уже привязано к конкретной камере, поэтому считается однозначно. Оплата
 * (Income) не всегда фиксируется с указанием камеры — новые платежи это поле требуют (см.
 * lib/validation.ts::incomeCreateSchema), но платежи, заведённые раньше, могли быть "за
 * контейнер в целом". Такие суммы распределяются между камерами того же клиента в этом же
 * контейнере автоматически: сначала гасится самая старая камера (по дате первой записи в ней),
 * остаток (переплата) приписывается самой новой — см. allocateUnassignedPaid ниже. Сумма по
 * камерам всегда точно сходится с общей суммой по клиенту+контейнеру.
 */
export interface DebtRecordBreakdown {
  recordId: string;
  productName: string;
  quantity: number;
  unit: Unit;
  tariff: ITariff;
  since: Date;
  accrued: number;
  /** Проставлена, если запись закрыта ("товар забран", см. models/StorageRecord.ts::closedAt) —
   * начисление остановлено на эту дату. undefined — запись активна. */
  closedAt?: Date;
}

/** Долг клиента по ОДНОЙ камере одного контейнера — самая мелкая единица агрегации. */
export interface ClientCellDebt {
  clientId: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  cellNumber: number;
  since: Date;
  to: Date;
  accrued: number;
  paid: number;
  balance: number;
  records: DebtRecordBreakdown[];
  /**
   * У клиента есть хотя бы одна незакрытая запись где-либо в запрошенной области (см.
   * lib/tenants.ts::TenantListItem.active — то же самое понятие "съехал"/архив, посчитанное
   * здесь же, чтобы не делать отдельный запрос). false — клиент архивный: НЕ убирается из этого
   * списка (долг по нему как считался, так и считается — задолженность не списывается сама
   * собой), но используется, чтобы скрыть архивных клиентов там, где выбирают, КОМУ принять
   * новую оплату (см. components/miniapp/AddIncomeWizard.tsx, PaymentForm в
   * app/dashboard/income/page.tsx) — архивному клиенту оплату больше не принимают через этот
   * список, независимо от того, есть за ним долг или нет.
   */
  active: boolean;
}

/** Долг клиента по контейнеру ЦЕЛИКОМ — сумма по всем его камерам в этом контейнере, плюс сами
 * камеры (для мест, где нужна детализация без отдельного запроса). */
export interface ClientContainerDebt {
  clientId: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  since: Date;
  to: Date;
  accrued: number;
  paid: number;
  balance: number;
  records: DebtRecordBreakdown[];
  cells: ClientCellDebt[];
  /** См. ClientCellDebt.active выше — одинаково для всех камер одного клиента. */
  active: boolean;
}

interface CellGroup {
  clientId: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  cellNumber: number;
  since: Date;
  records: DebtRecordBreakdown[];
  paid: number;
}

/**
 * Оплаты без указанной камеры (легаси, см. комментарий выше) распределяются между камерами того
 * же клиента+контейнера: сначала гасится камера с самой ранней `since` (первая запись в ней) —
 * пока её (начислено − уже оплачено явно) не покроется, потом следующая по дате, и т.д. Остаток
 * пула (если он больше суммарного долга — переплата) целиком уходит в самую новую камеру.
 * Считается на лету при каждом запросе — сами документы Income не меняются.
 */
function allocateUnassignedPaid(pool: number, cellsSortedBySince: CellGroup[], accruedByCell: Map<string, number>): void {
  let remaining = pool;
  for (const cell of cellsSortedBySince) {
    if (remaining <= 0) break;
    const key = `${cell.containerId}::${cell.cellNumber}`;
    const accrued = accruedByCell.get(key) || 0;
    const owedHere = Math.max(0, accrued - cell.paid);
    const take = Math.min(remaining, owedHere);
    if (take > 0) {
      cell.paid += take;
      remaining -= take;
    }
  }
  if (remaining > 0 && cellsSortedBySince.length > 0) {
    cellsSortedBySince[cellsSortedBySince.length - 1].paid += remaining;
  }
}

/**
 * Все связки «клиент + контейнер + камера» с начислением/оплатой/остатком на дату `to`.
 * `clientId` сужает выборку до одного клиента — используется ботом (нет, бот работает по
 * телефону — см. lib/goodsOwnerBot.ts) и веб-панелью/Mini App, когда не нужна сводка по всем
 * сразу.
 */
export async function getAllClientCellDebts(
  opts: { to?: Date; clientId?: string; containerIds?: string[] } = {}
): Promise<ClientCellDebt[]> {
  const to = opts.to || new Date();
  await connectDB();

  const recordFilter: Record<string, unknown> = {};
  if (opts.containerIds) {
    // Ограничение по доступным сотруднику контейнерам (см. lib/miniAuth.ts::allowedContainerIds).
    recordFilter.containerId = { $in: opts.containerIds };
  }
  if (opts.clientId) recordFilter.clientId = opts.clientId;

  const records = await StorageRecord.find(recordFilter)
    .populate<{ containerId: { _id: unknown; name: string } }>("containerId", "name")
    .lean();

  const groups = new Map<string, CellGroup>();
  // clientId::containerId -> список ключей камер (для распределения "безадресных" платежей).
  const cellsByClientContainer = new Map<string, CellGroup[]>();

  for (const r of records as any[]) {
    const clientId = String(r.clientId);
    const containerRef = r.containerId as { _id: unknown; name: string } | null;
    const containerId = String(containerRef?._id ?? r.containerId);
    const groupKey = `${clientId}::${containerId}::${r.cellNumber}`;

    if (!groups.has(groupKey)) {
      const group: CellGroup = {
        clientId,
        ownerType: r.goodsOwner.type,
        ownerLabel: ownerLabelOf(r.goodsOwner),
        containerId,
        containerName: containerRef?.name || "—",
        cellNumber: r.cellNumber,
        since: r.createdAt,
        records: [],
        paid: 0,
      };
      groups.set(groupKey, group);
      const ccKey = `${clientId}::${containerId}`;
      if (!cellsByClientContainer.has(ccKey)) cellsByClientContainer.set(ccKey, []);
      cellsByClientContainer.get(ccKey)!.push(group);
    }
    const g = groups.get(groupKey)!;
    if (r.createdAt < g.since) g.since = r.createdAt;

    // Закрытая запись ("товар забран", см. models/StorageRecord.ts::closedAt) не начисляет
    // дальше closedAt, даже если запрошенная дата `to` позже — начисление "заморожено" на
    // момент закрытия. Если `to` раньше closedAt (смотрим задолженность на прошлую дату, когда
    // запись ещё была активна), ограничение не действует — берём саму `to`.
    const accrualTo = r.closedAt && r.closedAt < to ? r.closedAt : to;

    // Записи, созданные до появления поля "тариф" (ранние тестовые/сид-записи), не имеют
    // r.tariff — такая запись просто не начисляет долг (accrued: 0), а не ломает остальные.
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

  const accruedByCell = new Map<string, number>();
  for (const g of groups.values()) {
    accruedByCell.set(`${g.containerId}::${g.cellNumber}`, g.records.reduce((sum, r) => sum + r.accrued, 0));
  }

  const incomeFilter: Record<string, unknown> = { paidAt: { $lte: to } };
  if (opts.clientId) incomeFilter.clientId = opts.clientId;
  const incomes = await Income.find(incomeFilter).lean();

  // Платежи с явно указанной камерой — начисляются напрямую на неё.
  const unassignedPoolByClientContainer = new Map<string, number>();
  for (const inc of incomes) {
    const clientId = String(inc.clientId);
    const containerId = String(inc.containerId);
    if (inc.cellNumber) {
      const g = groups.get(`${clientId}::${containerId}::${inc.cellNumber}`);
      // Если группы нет (напр. клиент оплатил камеру, где у него уже нет активных/закрытых
      // записей в этом контейнере — легаси-данные) — деньги не теряются молча, а уходят в общий
      // пул контейнера, как и "безадресные" платежи ниже.
      if (g) {
        g.paid += inc.amount;
        continue;
      }
    }
    const ccKey = `${clientId}::${containerId}`;
    unassignedPoolByClientContainer.set(ccKey, (unassignedPoolByClientContainer.get(ccKey) || 0) + inc.amount);
  }

  for (const [ccKey, pool] of unassignedPoolByClientContainer) {
    const cells = cellsByClientContainer.get(ccKey);
    if (!cells || cells.length === 0) continue; // платёж на связку без единой записи — отбрасываем
    const sorted = [...cells].sort((a, b) => a.since.getTime() - b.since.getTime());
    allocateUnassignedPaid(pool, sorted, accruedByCell);
  }

  // "Активен" — считается по КЛИЕНТУ целиком (across все его камеры/контейнеры в этой выборке),
  // не по отдельной камере: клиент, у которого закрыта одна камера, но открыта другая, всё ещё
  // активен (см. ClientCellDebt.active выше — то же понятие, что и lib/tenants.ts::getAllTenants).
  const clientActive = new Map<string, boolean>();
  for (const g of groups.values()) {
    const hasOpenRecord = g.records.some((r) => !r.closedAt);
    clientActive.set(g.clientId, (clientActive.get(g.clientId) || false) || hasOpenRecord);
  }

  const result: ClientCellDebt[] = [];
  for (const g of groups.values()) {
    const accrued = g.records.reduce((sum, r) => sum + r.accrued, 0);
    result.push({
      clientId: g.clientId,
      ownerType: g.ownerType,
      ownerLabel: g.ownerLabel,
      containerId: g.containerId,
      containerName: g.containerName,
      cellNumber: g.cellNumber,
      since: g.since,
      to,
      accrued,
      paid: g.paid,
      balance: accrued - g.paid,
      records: g.records.sort((a, b) => a.since.getTime() - b.since.getTime()),
      active: clientActive.get(g.clientId) ?? true,
    });
  }

  return result.sort((a, b) => b.balance - a.balance);
}

/** То же самое, свёрнутое до уровня клиент+контейнер (без разбивки по камерам) — для мест,
 * которым детализация до камеры не нужна (карточка арендатора, шаг "контейнер" в мастере
 * оплаты). Внутри каждой записи остаётся `cells` — на случай, если детализация всё же нужна. */
export async function getAllClientContainerDebts(
  opts: { to?: Date; clientId?: string; containerIds?: string[] } = {}
): Promise<ClientContainerDebt[]> {
  const cellDebts = await getAllClientCellDebts(opts);

  const map = new Map<string, ClientContainerDebt>();
  for (const c of cellDebts) {
    const key = `${c.clientId}::${c.containerId}`;
    const existing = map.get(key);
    if (existing) {
      existing.accrued += c.accrued;
      existing.paid += c.paid;
      existing.balance += c.balance;
      existing.records.push(...c.records);
      existing.cells.push(c);
      if (c.since < existing.since) existing.since = c.since;
    } else {
      map.set(key, {
        clientId: c.clientId,
        ownerType: c.ownerType,
        ownerLabel: c.ownerLabel,
        containerId: c.containerId,
        containerName: c.containerName,
        since: c.since,
        to: c.to,
        accrued: c.accrued,
        paid: c.paid,
        balance: c.balance,
        records: [...c.records],
        cells: [c],
        active: c.active,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
}

export async function getClientContainerDebt(
  clientId: string,
  containerId: string,
  to: Date = new Date()
): Promise<ClientContainerDebt | null> {
  const debts = await getAllClientContainerDebts({ to, clientId });
  return debts.find((d) => d.containerId === containerId) || null;
}

export async function getDebtsForClient(
  clientId: string,
  to: Date = new Date(),
  containerIds?: string[]
): Promise<ClientContainerDebt[]> {
  return getAllClientContainerDebts({ to, clientId, containerIds });
}
