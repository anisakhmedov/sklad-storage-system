import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
// Побочный эффект: регистрирует схему "Container" в Mongoose до populate() ниже
// (см. пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { quantityAdjustSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { sendActToEmployee } from "@/lib/telegramNotify";

/**
 * Добавление/убавление количества груза у существующей записи (Mini App) — п.5 доработок.
 * При добавлении (delta > 0) сотруднику автоматически присылается акт приёма-передачи
 * доп. товара (см. lib/telegramNotify.ts::sendActToEmployee, п.6). При убавлении акт не
 * формируется — это просто корректировка остатка.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = quantityAdjustSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const record = await StorageRecord.findById(params.id).populate<{
    containerId: { _id: unknown; name: string };
  }>("containerId", "name");
  if (!record) return jsonError("Запись не найдена", 404);

  if (!employeeCanAccessContainer(employee, String(record.containerId?._id ?? record.containerId))) {
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

  const containerName = (record.containerId as unknown as { name?: string })?.name || "—";
  if (delta > 0) {
    // Best-effort, не блокирует ответ (см. lib/telegramNotify.ts).
    await sendActToEmployee(employee.telegramId, record, containerName, delta, after);
  }

  return NextResponse.json({ record: { id: String(record._id), quantity: record.quantity } });
}
