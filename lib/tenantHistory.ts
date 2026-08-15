import { connectDB } from "./db";
import { Act, ActKind } from "@/models/Act";
import { Income } from "@/models/Income";
// Побочный эффект: регистрирует схему "Container" до populate() ниже (см. пояснение в
// lib/contract/contractService.ts).
import "@/models/Container";

/**
 * Единая хронологическая история операций по арендатору (п.1 доработок — «история приёма,
 * отдачи, оплаты и т.д.»): склеивает два независимых источника —
 * - Act (models/Act.ts) — приём/отдача товара, выдача/возврат инвентаря, каждая
 *   операция уже привязана к PDF-акту;
 * - Income (models/Income.ts) — фактические оплаты.
 * Раньше это были две отдельные никак не связанные таблицы (см. app/dashboard/tenants/[ownerKey]);
 * здесь они сведены в одну ленту, отсортированную по дате.
 */
export type HistoryEventKind = ActKind | "payment";

export interface TenantHistoryEvent {
  kind: HistoryEventKind;
  date: Date;
  containerId: string;
  containerName: string;
  cellNumber?: number;
  /** Что произошло: наименование товара/позиции инвентаря/"Оплата". */
  itemLabel: string;
  /** Текст количества — только у актов (напр. "12 кг"). */
  quantityText?: string;
  /** Сумма — только у оплаты. */
  amount?: number;
  method?: string;
  note?: string;
  /** Для актов — можно открыть PDF (см. GET /api/acts/[id]/pdf). */
  actId?: string;
  actNumber?: string;
  createdBy: string;
}

export async function getTenantHistory(
  clientId: string,
  opts: { containerId?: string; limit?: number } = {}
): Promise<TenantHistoryEvent[]> {
  await connectDB();

  const actFilter: Record<string, unknown> = { clientId };
  const incomeFilter: Record<string, unknown> = { clientId };
  if (opts.containerId) {
    actFilter.containerId = opts.containerId;
    incomeFilter.containerId = opts.containerId;
  }

  const [acts, incomes] = await Promise.all([
    Act.find(actFilter)
      .select("-pdfBuffer")
      .sort({ createdAt: -1 })
      .limit(opts.limit || 300)
      .lean(),
    Income.find(incomeFilter)
      .populate<{ containerId: { _id: unknown; name: string } | null }>("containerId", "name")
      .sort({ paidAt: -1 })
      .limit(opts.limit || 300)
      .lean(),
  ]);

  const events: TenantHistoryEvent[] = [];

  for (const a of acts) {
    events.push({
      kind: a.kind,
      date: a.createdAt,
      containerId: String(a.containerId),
      containerName: a.containerName,
      cellNumber: a.cellNumber,
      itemLabel: a.itemLabel,
      quantityText: a.totalQuantityText ? `${a.changedQuantityText} (всего ${a.totalQuantityText})` : a.changedQuantityText,
      actId: String(a._id),
      actNumber: a.actNumber,
      createdBy: a.createdBy,
    });
  }

  for (const inc of incomes) {
    const containerRef = inc.containerId as unknown as { _id: unknown; name: string } | null;
    events.push({
      kind: "payment",
      date: inc.paidAt,
      containerId: containerRef ? String(containerRef._id) : String(inc.containerId),
      containerName: containerRef?.name || "—",
      cellNumber: inc.cellNumber,
      itemLabel: "Оплата",
      amount: inc.amount,
      method: inc.method,
      note: inc.note,
      createdBy: inc.recordedBy,
    });
  }

  return events
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, opts.limit || 300);
}
