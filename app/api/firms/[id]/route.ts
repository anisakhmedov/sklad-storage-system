import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Firm } from "@/models/Firm";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { firmUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = firmUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const firm = await Firm.findById(params.id);
  if (!firm) return jsonError("Фирма не найдена", 404);

  const before = firm.toObject();
  Object.assign(firm, parsed.data);
  await firm.save();

  await logAudit({
    entity: "Firm",
    entityId: firm._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before, after: firm.toObject() },
  });

  return NextResponse.json({ firm });
}

/**
 * Удаление фирмы НЕ трогает уже выданные документы — StorageRecord.issuingFirm хранит
 * снимок реквизитов на момент создания записи, а не ссылку (см. models/StorageRecord.ts).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const firm = await Firm.findById(params.id);
  if (!firm) return jsonError("Фирма не найдена", 404);

  const snapshot = firm.toObject();
  await firm.deleteOne();

  await logAudit({
    entity: "Firm",
    entityId: firm._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
