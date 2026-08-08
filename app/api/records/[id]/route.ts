import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { storageRecordUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = storageRecordUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const record = await StorageRecord.findById(params.id);
  if (!record) return jsonError("Запись не найдена", 404);

  const before = record.toObject();

  const data = parsed.data;
  if (data.containerId !== undefined) record.containerId = data.containerId as any;
  if (data.productName !== undefined) record.productName = data.productName;
  if (data.quantity !== undefined) record.quantity = data.quantity;
  if (data.unit !== undefined) record.unit = data.unit;
  if (data.goodsOwner !== undefined) {
    // Полная замена, а не слияние: goodsOwner — дискриминированный union (individual/company),
    // при смене типа арендатора поля старого варианта не должны "просачиваться" в новый.
    record.goodsOwner = data.goodsOwner as any;
  }
  if (data.payment !== undefined) {
    record.payment = { ...record.payment, ...data.payment } as any;
  }
  record.editedBy = user.identifier;
  record.editedAt = new Date();

  await record.save();

  await logAudit({
    entity: "StorageRecord",
    entityId: record._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before, after: record.toObject() },
  });

  return NextResponse.json({ record });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const record = await StorageRecord.findById(params.id);
  if (!record) return jsonError("Запись не найдена", 404);

  const snapshot = record.toObject();
  await record.deleteOne();

  await logAudit({
    entity: "StorageRecord",
    entityId: record._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
