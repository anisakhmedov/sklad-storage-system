import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TransportContainer } from "@/models/TransportContainer";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { transportContainerGiveSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * Сотрудник выдаёт клиенту / освобождает контейнер для перевозки — БЕЗ актов (по ТЗ: "просто
 * даются клиентам для перевозки… и никакие акты не делаются", см. models/TransportContainer.ts).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

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
      actorId: String(employee._id),
      actorRole: "employee",
      changes: { status: { before, after: container.status }, currentOwnerLabel: container.currentOwnerLabel },
    });

    return NextResponse.json({ container });
  } catch (err) {
    console.error("PATCH /api/miniapp/transport-containers/[id]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
