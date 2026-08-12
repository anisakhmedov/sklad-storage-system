import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { getCellsGrid, toggleCellFull } from "@/lib/containerCells";
import { cellFullToggleSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";

/** Сетка камер (2×4) одного контейнера — шаг "Камера" в NewRecordWizard и CellsScreen. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }
  if (!employeeCanAccessContainer(employee, params.id)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  await connectDB();
  const container = await Container.findById(params.id).select("_id").lean();
  if (!container) return jsonError("Контейнер не найден", 404);

  const [grid] = await getCellsGrid([params.id]);
  return NextResponse.json({ cells: grid?.cells || [] });
}

/** Ручная отметка "камера заполнена / свободна" — см. models/Container.ts::fullCells. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }
  if (!employeeCanAccessContainer(employee, params.id)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = cellFullToggleSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(params.id).select("_id").lean();
  if (!container) return jsonError("Контейнер не найден", 404);

  await toggleCellFull(params.id, parsed.data.cellNumber, parsed.data.full);

  await logAudit({
    entity: "Container",
    entityId: params.id,
    action: "update",
    actorId: String(employee._id),
    actorRole: "employee",
    changes: { cellNumber: parsed.data.cellNumber, full: parsed.data.full },
  });

  return NextResponse.json({ ok: true });
}
