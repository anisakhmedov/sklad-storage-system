import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TransportContainer } from "@/models/TransportContainer";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { transportContainerGiveSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * Выдать клиенту / освободить контейнер для перевозки — простое переключение состояния, БЕЗ
 * генерации PDF-актов (явное требование ТЗ, см. models/TransportContainer.ts). `action: "give"`
 * требует currentOwnerLabel, `action: "free"` — нет.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  if (!body || (body.action !== "give" && body.action !== "free")) {
    return jsonError("Некорректное действие", 400);
  }

  await connectDB();
  const container = await TransportContainer.findById(params.id);
  if (!container) return jsonError("Контейнер не найден", 404);

  const before = container.status;
  if (body.action === "give") {
    const parsed = transportContainerGiveSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
    if (container.status === "in_use") return jsonError("Контейнер уже выдан клиенту", 409);
    container.status = "in_use";
    container.currentOwnerLabel = parsed.data.currentOwnerLabel;
    container.givenAt = new Date();
    container.freedAt = undefined;
  } else {
    if (container.status === "free") return jsonError("Контейнер уже свободен", 409);
    container.status = "free";
    container.currentOwnerLabel = undefined;
    container.freedAt = new Date();
  }
  await container.save();

  await logAudit({
    entity: "TransportContainer",
    entityId: container._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { status: { before, after: container.status }, currentOwnerLabel: container.currentOwnerLabel },
  });

  return NextResponse.json({ container });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const container = await TransportContainer.findById(params.id);
  if (!container) return jsonError("Контейнер не найден", 404);

  const snapshot = container.toObject();
  await container.deleteOne();

  await logAudit({
    entity: "TransportContainer",
    entityId: container._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
