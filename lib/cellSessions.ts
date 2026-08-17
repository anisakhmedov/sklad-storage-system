import { connectDB } from "./db";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { ownerLabelOf } from "./ownerKey";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "./cells";
import type { IGoodsOwner, GoodsOwnerType } from "@/models/StorageRecord";

/**
 * «Отсчёт по камере» (п. доработок — история заполненности каждой камеры хранения). Идея: камера
 * пустая → заходит первый арендатор → отсчёт (сессия) начинается; пока в камере физически есть
 * ХОТЯ БЫ ОДИН арендатор — сессия продолжается, даже если в неё за это время заходят и выходят
 * другие (напр. первый пришёл 12 августа, второй — 24-го, первый или второй уехал раньше — сессия
 * всё ещё открыта); закрывается сессия только когда камера становится ПОЛНОСТЬЮ пустой — последний
 * арендатор съехал. Следующий заход в ту же камеру после этого — уже НОВАЯ сессия/отчёт.
 *
 * "Заехал"/"съехал" — те же события, что и везде в проекте: StorageRecord.createdAt (запись
 * создана — товар/арендатор размещён в камере) и StorageRecord.closedAt (запись закрыта, "товар
 * забран" — арендатор физически покинул камеру, см. models/StorageRecord.ts, lib/tenantMatrix.ts,
 * lib/containerCells.ts). Изменение quantity (частичное списание, см.
 * app/api/miniapp/records/[id]/adjust/route.ts) сюда сознательно не примешивается — у него нет
 * достоверной даты "стало 0", а closedAt — явное, датированное решение сотрудника "клиент уехал".
 */

export interface CellSessionParticipant {
  clientId: string;
  ownerLabel: string;
  ownerType: GoodsOwnerType;
  /** Первая дата появления этого клиента в данной сессии (createdAt самой ранней его записи,
   * попавшей в сессию). */
  arrivedAt: Date;
  /** Дата, когда закрылась последняя запись этого клиента в этой сессии — undefined, если у
   * клиента в этой сессии есть ещё хотя бы одна незакрытая запись (он ещё здесь). */
  leftAt?: Date;
  /** Товары этого клиента за время сессии (без дублей), для беглого просмотра в отчёте. */
  productSummary: string;
  recordIds: string[];
}

export interface CellSession {
  containerId: string;
  containerName: string;
  cellNumber: number;
  /** Дата, когда камера перестала быть пустой (createdAt первой записи сессии). */
  startedAt: Date;
  /** Дата, когда камера снова стала полностью пустой — undefined, пока сессия открыта. */
  endedAt?: Date;
  /** Сессия ещё идёт — в камере физически остаётся хотя бы один арендатор. */
  isOpen: boolean;
  /** Сколько дней камера была (или уже) занята — до endedAt, либо до сегодня, если открыта. */
  durationDays: number;
  participants: CellSessionParticipant[];
}

export interface ContainerCellSessions {
  containerId: string;
  containerName: string;
  /** cellNumber -> сессии этой камеры, от новой к старой. */
  cells: { cellNumber: number; sessions: CellSession[] }[];
}

type RecordRow = {
  _id: unknown;
  containerId: unknown;
  cellNumber: number;
  clientId: unknown;
  productName: string;
  goodsOwner: IGoodsOwner;
  createdAt: Date;
  closedAt?: Date;
};

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/** Склеивает отсортированные по createdAt записи одной камеры в сессии (см. пояснение выше —
 * стандартное слияние пересекающихся интервалов [createdAt, closedAt ?? "сейчас"]). */
function buildSessionsForCell(records: RecordRow[], containerId: string, containerName: string, cellNumber: number): CellSession[] {
  const now = new Date();
  const sessions: CellSession[] = [];

  let current: {
    startedAt: Date;
    end: Date | null; // null = сессия ещё открыта (есть незакрытая запись)
    byClient: Map<string, CellSessionParticipant & { products: Set<string> }>;
  } | null = null;

  const finalize = () => {
    if (!current) return;
    const participants = Array.from(current.byClient.values())
      .map((p) => ({ ...p, productSummary: Array.from(p.products).join(", ") }))
      .sort((a, b) => a.arrivedAt.getTime() - b.arrivedAt.getTime());
    sessions.push({
      containerId,
      containerName,
      cellNumber,
      startedAt: current.startedAt,
      endedAt: current.end ?? undefined,
      isOpen: current.end === null,
      durationDays: daysBetween(current.startedAt, current.end ?? now),
      participants,
    });
    current = null;
  };

  for (const r of records) {
    const createdAt = r.createdAt;
    const closedAt = r.closedAt ?? null;

    // Начинаем новую сессию, если ещё не было ни одной, либо предыдущая уже закрылась ДО того,
    // как эта запись появилась (camера успела побывать полностью пустой между ними).
    const gapSincePrevious = current && current.end !== null && createdAt > current.end;
    if (!current || gapSincePrevious) {
      finalize();
      current = { startedAt: createdAt, end: closedAt, byClient: new Map() };
    } else {
      // Продолжаем текущую сессию: если она уже была открыта (end === null) — остаётся открытой;
      // если была закрыта, но эта запись пересеклась с её концом — расширяем границу.
      if (current.end !== null) {
        current.end = closedAt === null ? null : current.end && current.end > closedAt ? current.end : closedAt;
      }
    }

    const clientId = String(r.clientId);
    const existing = current.byClient.get(clientId);
    if (existing) {
      if (createdAt < existing.arrivedAt) existing.arrivedAt = createdAt;
      // existing.leftAt === undefined уже означает "у клиента есть незакрытая запись, он ещё
      // здесь" — эта запись closedAt=null подтверждает это же; закрытая запись меняет leftAt,
      // только если ВСЕ остальные записи этого клиента в сессии тоже уже закрыты.
      if (closedAt === null) {
        existing.leftAt = undefined;
      } else if (existing.leftAt !== undefined) {
        existing.leftAt = existing.leftAt > closedAt ? existing.leftAt : closedAt;
      }
      existing.products.add(r.productName);
      existing.recordIds.push(String(r._id));
    } else {
      current.byClient.set(clientId, {
        clientId,
        ownerLabel: ownerLabelOf(r.goodsOwner),
        ownerType: r.goodsOwner.type,
        arrivedAt: createdAt,
        leftAt: closedAt ?? undefined,
        productSummary: "",
        products: new Set([r.productName]),
        recordIds: [String(r._id)],
      });
    }
  }
  finalize();

  return sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

/**
 * История заполненности камер — сгруппирована по контейнеру → камере → сессиям (от новой к
 * старой). containerIds — undefined = все контейнеры.
 */
export async function getCellSessions(containerIds?: string[]): Promise<ContainerCellSessions[]> {
  await connectDB();

  const containerFilter = containerIds ? { _id: { $in: containerIds } } : {};
  const containers = await Container.find(containerFilter).sort({ name: 1 }).lean();
  if (containers.length === 0) return [];

  const records = (await StorageRecord.find({
    containerId: { $in: containers.map((c) => c._id) },
  })
    .select("containerId cellNumber clientId productName goodsOwner createdAt closedAt")
    .sort({ createdAt: 1 })
    .lean()) as unknown as RecordRow[];

  // containerId -> cellNumber -> records[]
  const byContainer = new Map<string, Map<number, RecordRow[]>>();
  for (const r of records) {
    const containerId = String(r.containerId);
    if (!byContainer.has(containerId)) byContainer.set(containerId, new Map());
    const byCell = byContainer.get(containerId)!;
    if (!byCell.has(r.cellNumber)) byCell.set(r.cellNumber, []);
    byCell.get(r.cellNumber)!.push(r);
  }

  return containers.map((c) => {
    const containerId = String(c._id);
    const byCell = byContainer.get(containerId);
    const cellNumbers = cellNumbersForCount(c.cellCount ?? DEFAULT_CELL_COUNT);
    const cells = cellNumbers
      .map((cellNumber) => ({
        cellNumber,
        sessions: byCell?.has(cellNumber)
          ? buildSessionsForCell(byCell.get(cellNumber)!, containerId, c.name, cellNumber)
          : [],
      }))
      // Камеры, где вообще никогда никого не было, в отчёте не нужны.
      .filter((cell) => cell.sessions.length > 0);
    return { containerId, containerName: c.name, cells };
  });
}
