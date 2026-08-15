import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Income } from "@/models/Income";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { Client } from "@/models/Client";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { incomeCreateSchemaEmployee } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { denormalizeOwner } from "@/lib/ownerKey";

/**
 * Запись фактической оплаты сотрудником из Mini App — тот же путь данных, что и
 * POST /api/income на веб-панели (клиент+контейнер+камера должны иметь хотя бы одну
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
  // employee-схема сужает "method" — перечисление сотрудник записать не может (см.
  // lib/validation.ts::incomeCreateSchemaEmployee), это не только UI-ограничение, чтобы
  // прямой запрос к API в обход кнопок в components/miniapp/AddIncomeWizard.tsx тоже отсекался.
  const parsed = incomeCreateSchemaEmployee.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  await connectDB();

  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const client = await Client.findById(parsed.data.clientId).lean();
  if (!client) return jsonError("Клиент не найден", 404);

  // Камера обязательна (см. lib/validation.ts::incomeCreateSchema) и должна совпадать с одной
  // из камер, где у этого клиента реально есть запись в этом контейнере — защита от опечаток
  // и от оплаты за камеру, которую клиент не занимает.
  const hasRecordInCell = await StorageRecord.exists({
    clientId: parsed.data.clientId,
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
  });
  if (!hasRecordInCell) {
    return jsonError("У этого клиента нет записей в выбранной камере этого контейнера", 404);
  }

  const income = await Income.create({
    clientId: client._id,
    ...denormalizeOwner(client.profile),
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
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
      clientId: String(income.clientId),
      ownerLabel: income.ownerLabel,
      containerId: String(income.containerId),
      amount: income.amount,
      method: income.method,
      paidAt: income.paidAt,
    },
  });

  return NextResponse.json({ income: { id: String(income._id) } });
}
