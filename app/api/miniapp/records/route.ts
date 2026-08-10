import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Container } from "@/models/Container";
import { resolveEmployee } from "@/lib/miniAuth";
import { storageRecordCreateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { notifyGoodsOwnerRegistered, sendContractToEmployee } from "@/lib/telegramNotify";

export async function POST(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = storageRecordCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const record = await StorageRecord.create({
    containerId: parsed.data.containerId,
    productName: parsed.data.productName,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    goodsOwner: parsed.data.goodsOwner,
    tariff: parsed.data.tariff,
    createdByEmployeeId: employee._id,
  });

  await logAudit({
    entity: "StorageRecord",
    entityId: record._id,
    action: "create",
    actorId: String(employee._id),
    actorRole: "employee",
    changes: {
      containerId: parsed.data.containerId,
      productName: parsed.data.productName,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
    },
  });

  // Уведомления — часть 2/3 ТЗ. Best-effort: сбой Telegram (или отсутствие токена в dev)
  // не должен ронять сохранение записи, поэтому запись уже успешно создана и отвечена
  // клиенту независимо от результата этих вызовов (см. lib/telegramNotify.ts).
  if (record.goodsOwner.type === "individual") {
    await Promise.all([
      notifyGoodsOwnerRegistered(record, container.name),
      sendContractToEmployee(employee.telegramId, record, container.name),
    ]);
  }

  return NextResponse.json({ record: { id: String(record._id) } });
}
