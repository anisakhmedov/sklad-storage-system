import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { storageRecordCloseSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { Types } from "mongoose";

/**
 * Закрытие/переоткрытие записи ("товар забран") — Mini App, тот же смысл, что и
 * app/api/records/[id]/close/route.ts на веб-панели. closedAt: Date закрывает (начисление
 * тарифа останавливается на эту дату, запись пропадает из сводной таблицы "Арендаторы"),
 * closedAt: null — переоткрывает.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    if (!Types.ObjectId.isValid(params.id)) return jsonError("Некорректный идентификатор записи", 400);

    const body = await req.json().catch(() => null);
    const parsed = storageRecordCloseSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    await connectDB();
    const record = await StorageRecord.findById(params.id);
    if (!record) return jsonError("Запись не найдена", 404);

    if (!employeeCanAccessContainer(employee, String(record.containerId))) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    const before = record.toObject();
    if (parsed.data.closedAt === null) {
      record.closedAt = undefined;
      record.closedBy = undefined;
    } else {
      record.closedAt = parsed.data.closedAt;
      record.closedBy = employee.name;
    }
    record.editedBy = employee.name;
    record.editedAt = new Date();
    await record.save();

    await logAudit({
      entity: "StorageRecord",
      entityId: record._id,
      action: "update",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: { before, after: record.toObject() },
    });

    return NextResponse.json({ record });
  } catch (err) {
    console.error("POST /api/miniapp/records/[id]/close:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
