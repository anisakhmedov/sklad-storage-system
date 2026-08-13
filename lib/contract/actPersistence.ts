import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Act, IAct, ActKind } from "@/models/Act";
import { getNextSequence } from "@/lib/counter";
import { renderActPdf, ActSubject, ActDirection } from "./generateAct";
import { actFilename } from "./actService";
import { DEFAULT_FIRM } from "./firmDefaults";
import type { GoodsOwnerType } from "@/models/StorageRecord";

const KIND_TO_SUBJECT: Record<ActKind, { subject: ActSubject; direction: ActDirection }> = {
  goods_given: { subject: "goods", direction: "given" },
  goods_returned: { subject: "goods", direction: "returned" },
  inventory_given: { subject: "inventory", direction: "given" },
  inventory_returned: { subject: "inventory", direction: "returned" },
  box_given: { subject: "boxes", direction: "given" },
  box_returned: { subject: "boxes", direction: "returned" },
};

export interface CreateAndSaveActInput {
  kind: ActKind;
  recordId?: string;
  ownerKey: string;
  ownerLabel: string;
  ownerType: GoodsOwnerType;
  containerId: string;
  containerName: string;
  cellNumber?: number;
  itemLabel: string;
  changedQuantityText: string;
  totalQuantityText?: string;
  contractNumber?: string;
  /** Фирма-подписант ("Сақловчи") — см. lib/contract/firmDefaults.ts. По умолчанию DEFAULT_FIRM
   * (акты по инвентарю/ящикам не привязаны к конкретной фирме записи). */
  firmName?: string;
  createdBy: string;
  createdByRole: "owner" | "employee";
}

/**
 * Единая точка сохранения акта: рендерит PDF (lib/contract/generateAct.ts::renderActPdf),
 * присваивает номер через lib/counter.ts (отдельная последовательность от договоров — ключ
 * `act:${year}`, чтобы номера актов и договоров не путались), сохраняет весь документ целиком
 * в Act (models/Act.ts) — акт, в отличие от договора, НЕ пересобирается по запросу (решение
 * владельца: акты должны открываться мгновенно из истории).
 *
 * Вызывается из трёх мест: app/api/miniapp/records/[id]/adjust/route.ts (goods_*),
 * app/api/miniapp/boxes/[ownerKey]/route.ts (box_*), app/api/miniapp/inventory/route.ts
 * (inventory_*). Ошибки здесь не проглатываются (в отличие от lib/telegramNotify.ts) — акт
 * обязателен, а его последующая отправка в Telegram уже best-effort.
 */
export async function createAndSaveAct(input: CreateAndSaveActInput): Promise<IAct> {
  await connectDB();
  const { subject, direction } = KIND_TO_SUBJECT[input.kind];
  const year = new Date().getFullYear();
  const seq = await getNextSequence(`act:${year}`);
  const actNumber = `${seq}-${year}`;

  const pdfBuffer = await renderActPdf({
    subject,
    direction,
    ownerLabel: input.ownerLabel,
    containerName: input.containerName,
    itemLabel: input.itemLabel,
    changedQuantityText: input.changedQuantityText,
    totalQuantityText: input.totalQuantityText,
    contractNumber: input.contractNumber,
    actNumber,
    dateText: new Date().toLocaleDateString("ru-RU"),
    firmName: input.firmName || DEFAULT_FIRM.name,
  });

  const filename = actFilename(subject, direction, input.ownerLabel);

  const act = await Act.create({
    actNumber,
    kind: input.kind,
    recordId: input.recordId ? new Types.ObjectId(input.recordId) : undefined,
    ownerKey: input.ownerKey,
    ownerLabel: input.ownerLabel,
    ownerType: input.ownerType,
    containerId: new Types.ObjectId(input.containerId),
    containerName: input.containerName,
    cellNumber: input.cellNumber,
    itemLabel: input.itemLabel,
    changedQuantityText: input.changedQuantityText,
    totalQuantityText: input.totalQuantityText,
    pdfBuffer,
    filename,
    createdBy: input.createdBy,
    createdByRole: input.createdByRole,
  });

  return act;
}
