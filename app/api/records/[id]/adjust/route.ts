import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { quantityAdjustSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { buildActFillData } from "@/lib/contract/generateAct";
import { createAndSaveAct } from "@/lib/contract/actPersistence";
import { ownerKeyOf } from "@/lib/ownerKey";

/**
 * Веб-версия app/api/miniapp/records/[id]/adjust/route.ts — тот же механизм (+/- количество,
 * акт "приёма-передачи"/"отдачи" сохраняется автоматически), но для владельца на веб-панели
 * (используется таблицей "Арендаторы" → "Таблица по камерам", см. lib/tenantMatrix.ts).
 * В отличие от Mini App, здесь некому отправлять акт в Telegram — он просто сохраняется и
 * доступен там же, где и остальные акты (страница "Записи").
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  if (!Types.ObjectId.isValid(params.id)) return jsonError("Некорректный идентификатор записи", 400);

  const body = await req.json().catch(() => null);
  const parsed = quantityAdjustSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const record = await StorageRecord.findById(params.id);
  if (!record) return jsonError("Запись не найдена", 404);

  const { delta, note } = parsed.data;
  const before = record.quantity;
  const after = before + delta;
  if (after < 0) {
    return jsonError(`Недостаточно груза для списания: на хранении ${before}`, 400);
  }

  record.quantity = after;
  record.editedBy = user.identifier;
  record.editedAt = new Date();
  await record.save();

  await logAudit({
    entity: "StorageRecord",
    entityId: record._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { quantityDelta: delta, quantityBefore: before, quantityAfter: after, note },
  });

  const container = await Container.findById(record.containerId).select("name").lean();
  const containerName = container?.name || "—";
  const fillData = buildActFillData(record, containerName, delta, after);
  const act = await createAndSaveAct({
    kind: delta > 0 ? "goods_given" : "goods_returned",
    recordId: String(record._id),
    clientId: String(record.clientId),
    ownerKey: ownerKeyOf(record.goodsOwner),
    ownerLabel: fillData.ownerLabel,
    ownerType: record.goodsOwner.type,
    containerId: String(record.containerId),
    containerName,
    cellNumber: record.cellNumber,
    itemLabel: fillData.itemLabel,
    changedQuantityText: fillData.changedQuantityText,
    totalQuantityText: fillData.totalQuantityText,
    contractNumber: record.contractNumber,
    firmName: fillData.firmName,
    createdBy: user.identifier,
    createdByRole: "owner",
  });

  return NextResponse.json({ record: { id: String(record._id), quantity: record.quantity }, actId: String(act._id) });
}
