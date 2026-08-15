import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { storageRecordCloseSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * Закрытие/переоткрытие записи ("товар забран") — веб-панель. closedAt: Date закрывает запись
 * (начисление тарифа останавливается на эту дату, запись пропадает из сводной таблицы
 * "Арендаторы", см. lib/tenantMatrix.ts), closedAt: null — переоткрывает (см.
 * lib/validation.ts::storageRecordCloseSchema, README → «Тарифы, оплата и задолженность»).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = storageRecordCloseSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const record = await StorageRecord.findById(params.id);
  if (!record) return jsonError("Запись не найдена", 404);

  const before = record.toObject();

  if (parsed.data.closedAt === null) {
    record.closedAt = undefined;
    record.closedBy = undefined;
  } else {
    record.closedAt = parsed.data.closedAt;
    record.closedBy = user.identifier;
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
