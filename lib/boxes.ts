import { connectDB } from "./db";
import { BoxLedgerEntry, IBoxLedgerEntry } from "@/models/BoxLedgerEntry";
// Побочный эффект: регистрирует схему "Container" до populate() ниже (см. пояснение в
// lib/contract/contractService.ts).
import "@/models/Container";

export interface BoxBalance {
  ownerKey: string;
  ownerType: IBoxLedgerEntry["ownerType"];
  ownerLabel: string;
  containerId: string;
  containerName: string;
  outstanding: number;
  /** Сколько всего выдано клиенту за всё время (сумма direction: "given"), без вычета
   * возвращённого — для отображения полной картины рядом с net-остатком (см.
   * lib/tenantMatrix.ts, components/dashboard/TenantMatrixTable.tsx). */
  given: number;
  /** Сколько всего принято обратно от клиента (сумма direction: "returned") — то самое
   * "принятие ящиков", которое раньше было видно только как часть net outstanding. */
  returned: number;
  ratePerBox: number;
  owedAmount: number;
  lastActivity: Date;
}

/**
 * Баланс ящиков по каждой связке владелец+контейнер (симметрично lib/debt.ts::getAllOwnerContainerDebts).
 * ratePerBox и owedAmount считаются по ТЕКУЩЕЙ (последней использованной) ставке × текущий остаток —
 * простая модель, без пересчёта по ставкам прошлых операций, чтобы сумма была однозначно понятна.
 */
export async function getAllBoxBalances(ownerKey?: string): Promise<BoxBalance[]> {
  await connectDB();
  const filter = ownerKey ? { ownerKey } : {};
  const entries = (await BoxLedgerEntry.find(filter)
    .sort({ createdAt: 1 })
    .populate("containerId", "name")
    .lean()) as unknown as (IBoxLedgerEntry & { containerId: { _id: unknown; name: string } | null })[];

  const groups = new Map<string, BoxBalance>();
  for (const e of entries) {
    const containerRef = e.containerId as { _id: unknown; name: string } | null;
    const containerId = String(containerRef?._id ?? e.containerId);
    const key = `${e.ownerKey}::${containerId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ownerKey: e.ownerKey,
        ownerType: e.ownerType,
        ownerLabel: e.ownerLabel,
        containerId,
        containerName: containerRef?.name || "—",
        outstanding: 0,
        given: 0,
        returned: 0,
        ratePerBox: e.ratePerBox,
        owedAmount: 0,
        lastActivity: e.createdAt,
      });
    }
    const g = groups.get(key)!;
    g.outstanding += e.direction === "given" ? e.quantity : -e.quantity;
    if (e.direction === "given") g.given += e.quantity;
    else g.returned += e.quantity;
    g.ratePerBox = e.ratePerBox; // самая свежая ставка (записи отсортированы по возрастанию даты)
    g.ownerLabel = e.ownerLabel; // на случай смены отображаемого имени
    if (e.createdAt > g.lastActivity) g.lastActivity = e.createdAt;
  }

  const result = Array.from(groups.values());
  for (const g of result) g.owedAmount = Math.max(0, g.outstanding) * g.ratePerBox;
  return result.filter((g) => g.outstanding !== 0).sort((a, b) => b.outstanding - a.outstanding);
}

export async function getBoxBalanceForOwner(ownerKey: string): Promise<BoxBalance[]> {
  return getAllBoxBalances(ownerKey);
}

/**
 * Сколько ящиков сейчас реально на руках у этой связки владелец+контейнер — используется как
 * верхняя граница для direction "returned" (см. app/api/boxes/route.ts,
 * app/api/miniapp/boxes/[ownerKey]/route.ts): нельзя принять от клиента больше, чем ему когда-либо
 * выдавали за вычетом уже возвращённого, иначе остаток уходит в минус без физического смысла.
 * getAllBoxBalances() отфильтровывает нулевые остатки — здесь 0 означает и "никогда не выдавали",
 * и "уже полностью вернул", что для этой проверки эквивалентно.
 */
export async function getBoxOutstanding(ownerKey: string, containerId: string): Promise<number> {
  const balances = await getAllBoxBalances(ownerKey);
  return balances.find((b) => b.containerId === containerId)?.outstanding || 0;
}
