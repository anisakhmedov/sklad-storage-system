import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Container } from "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { quantityAdjustSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { sendActToEmployee } from "@/lib/telegramNotify";
import { Types } from "mongoose";

/**
 * Добавление/убавление количества груза у существующей записи (Mini App). При любом изменении
 * (и добавлении, и убавлении) сотруднику автоматически присылается PDF-акт в Telegram —
 * «приёма-передачи» при delta > 0, «отдачи» при delta < 0 (см. lib/telegramNotify.ts::sendActToEmployee,
 * lib/contract/generateAct.ts) — один и тот же механизм для обоих направлений.
 *
 * Контейнер читается отдельным запросом (не через .populate() перед .save()) — сохранение
 * документа с populate-нутым ref-полем не всегда безопасно (риск CastError на containerId
 * при повторной валидации всего документа), проще и надёжнее держать containerId как ObjectId
 * до самого save() и получить название контейнера отдельно.
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
    const parsed = quantityAdjustSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    await connectDB();
    const record = await StorageRecord.findById(params.id);
    if (!record) return jsonError("Запись не найдена", 404);

    if (!employeeCanAccessContainer(employee, String(record.containerId))) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    const { delta, note } = parsed.data;
    const before = record.quantity;
    const after = before + delta;
    if (after < 0) {
      return jsonError(`Недостаточно груза для списания: на хранении ${before}`, 400);
    }

    record.quantity = after;
    record.editedBy = employee.name;
    record.editedAt = new Date();
    await record.save();

    await logAudit({
      entity: "StorageRecord",
      entityId: record._id,
      action: "update",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: { quantityDelta: delta, quantityBefore: before, quantityAfter: after, note },
    });

    // Best-effort, не блокирует ответ (см. lib/telegramNotify.ts) — сбой отправки акта
    // не должен откатывать уже сохранённое изменение количества. Направление акта
    // (приём/отдача) определяется знаком delta внутри sendActToEmployee.
    const container = await Container.findById(record.containerId).select("name").lean();
    await sendActToEmployee(employee.telegramId, record, container?.name || "—", delta, after);

    return NextResponse.json({ record: { id: String(record._id), quantity: record.quantity } });
  } catch (err) {
    console.error("POST /api/miniapp/records/[id]/adjust:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
