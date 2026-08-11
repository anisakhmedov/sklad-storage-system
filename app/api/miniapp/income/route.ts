import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Income } from "@/models/Income";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { incomeCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { parseOwnerKey } from "@/lib/ownerKey";

/**
 * Запись фактической оплаты сотрудником из Mini App — тот же путь данных, что и
 * POST /api/income на веб-панели (владелец+контейнер должны иметь хотя бы одну
 * StorageRecord, иначе задолженность в lib/debt.ts никогда не найдёт платёж), но
 * авторизация через Telegram initData (resolveEmployee), а не веб-сессию.
 */
export async function POST(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = incomeCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  await connectDB();

  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const ownerKeyParsed = parseOwnerKey(parsed.data.ownerKey);
  if (!ownerKeyParsed || ownerKeyParsed.type !== parsed.data.ownerType) {
    return jsonError("Некорректный идентификатор владельца груза", 400);
  }

  const ownerRecordFilter =
    ownerKeyParsed.type === "individual"
      ? { "goodsOwner.type": "individual", "goodsOwner.phone": ownerKeyParsed.value }
      : { "goodsOwner.type": "company", "goodsOwner.inn": ownerKeyParsed.value };
  const hasRecord = await StorageRecord.exists({
    ...ownerRecordFilter,
    containerId: parsed.data.containerId,
  });
  if (!hasRecord) {
    return jsonError("Не найдено ни одной записи с таким владельцем в этом контейнере", 404);
  }

  const income = await Income.create({
    ownerType: parsed.data.ownerType,
    ownerKey: parsed.data.ownerKey,
    ownerLabel: parsed.data.ownerLabel,
    containerId: parsed.data.containerId,
    amount: parsed.data.amount,
    method: parsed.data.method,
    paidAt: parsed.data.paidAt || new Date(),
    note: parsed.data.note,
    recordedBy: employee.name,
  });

  await logAudit({
    entity: "Income",
    entityId: income._id,
    action: "create",
    actorId: String(employee._id),
    actorRole: "employee",
    changes: {
      ownerKey: income.ownerKey,
      ownerLabel: income.ownerLabel,
      containerId: String(income.containerId),
      amount: income.amount,
      method: income.method,
      paidAt: income.paidAt,
    },
  });

  return NextResponse.json({ income: { id: String(income._id) } });
}
