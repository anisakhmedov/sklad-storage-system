import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { storageRecordUpdateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { Types } from "mongoose";

/**
 * Правка даты договора/даты окончания хранения и тарифа существующей записи — Mini App
 * (см. app/dashboard/records/page.tsx и app/api/records/[id]/route.ts — тот же набор полей
 * на веб-панели). Сознательно НЕ принимает containerId/cellNumber/goodsOwner/quantity здесь —
 * перенос в другую камеру/контейнер и правка владельца делаются на веб-панели, а количество
 * меняется отдельным маршрутом .../adjust (это добавление/списание, а не перезапись числа).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    if (!Types.ObjectId.isValid(params.id)) return jsonError("Некорректный идентификатор записи", 400);

    const body = await req.json().catch(() => null);
    // .pick(...) — та же схема, что и на веб-панели, но здесь разрешены только даты и тариф
    // (см. комментарий выше); лишние поля в теле запроса просто игнорируются zod'ом.
    const parsed = storageRecordUpdateSchema
      .pick({ createdAt: true, expectedEndDate: true, tariff: true })
      .safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    await connectDB();
    const record = await StorageRecord.findById(params.id);
    if (!record) return jsonError("Запись не найдена", 404);

    if (!employeeCanAccessContainer(employee, String(record.containerId))) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    const before = record.toObject();
    const data = parsed.data;
    if (data.createdAt !== undefined) record.createdAt = data.createdAt;
    if (data.expectedEndDate !== undefined) record.expectedEndDate = data.expectedEndDate;
    if (data.tariff !== undefined) record.tariff = { ...record.tariff, ...data.tariff } as any;
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
    console.error("PATCH /api/miniapp/records/[id]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
