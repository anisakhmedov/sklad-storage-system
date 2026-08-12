import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Container } from "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { storageRecordCreateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { notifyGoodsOwnerRegistered, sendContractToEmployee } from "@/lib/telegramNotify";
import { getNextSequence } from "@/lib/counter";

export async function POST(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = storageRecordCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  await connectDB();
  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  // Камера, вручную отмеченная как "заполнена" (см. models/Container.ts::fullCells),
  // недоступна для размещения нового груза — проверяем на сервере, а не только в UI
  // мастера (см. components/miniapp/NewRecordWizard.tsx), т.к. клиенту нельзя доверять.
  if (container.fullCells?.includes(parsed.data.cellNumber)) {
    return jsonError("Камера отмечена как заполненная — выберите другую", 409);
  }

  // Номер договора присваивается один раз, только физлицам (только для них формируется
  // договор, см. lib/contract/generateContract.ts) — последовательность по текущему году
  // (см. lib/counter.ts, README → «Номер договора»).
  const contractNumber =
    parsed.data.goodsOwner.type === "individual"
      ? `${await getNextSequence(`contract:${new Date().getFullYear()}`)}-${new Date().getFullYear()}`
      : undefined;

  const record = await StorageRecord.create({
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
    productName: parsed.data.productName,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    goodsOwner: parsed.data.goodsOwner,
    tariff: parsed.data.tariff,
    createdByEmployeeId: employee._id,
    contractNumber,
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
