import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { PatrolLog } from "@/models/PatrolLog";
import { resolveEmployee, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { patrolLogCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getTodayPatrolStatus, tashkentDateString } from "@/lib/patrols";

/** Статус обхода на сегодня по доступным сотруднику контейнерам (см. lib/patrols.ts). */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    await connectDB();
    const allowed = allowedContainerIds(employee);
    const filter = allowed ? { _id: { $in: allowed } } : {};
    const containers = await Container.find(filter).sort({ name: 1 }).select("name").lean();

    const status = await getTodayPatrolStatus(containers.map((c) => ({ id: String(c._id), name: c.name })));
    return NextResponse.json({ status });
  } catch (err) {
    console.error("GET /api/miniapp/patrols:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/** Записать температуру по контейнеру за период — перезаписывает, если обход уже был (upsert). */
export async function POST(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = patrolLogCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    const employeeAllowed = allowedContainerIds(employee);
    if (employeeAllowed && !employeeAllowed.includes(parsed.data.containerId)) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

    await connectDB();
    const container = await Container.findById(parsed.data.containerId);
    if (!container) return jsonError("Контейнер не найден", 404);

    const date = tashkentDateString();
    const log = await PatrolLog.findOneAndUpdate(
      { containerId: parsed.data.containerId, period: parsed.data.period, date },
      {
        $set: {
          temperature: parsed.data.temperature,
          employeeId: employee._id,
        },
      },
      { upsert: true, new: true }
    );

    await logAudit({
      entity: "PatrolLog",
      entityId: log._id,
      action: "create",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: {
        containerId: parsed.data.containerId,
        period: parsed.data.period,
        temperature: parsed.data.temperature,
      },
    });

    return NextResponse.json({ log: { id: String(log._id) } });
  } catch (err) {
    console.error("POST /api/miniapp/patrols:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
