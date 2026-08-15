import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { resolveEmployee, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";

export async function GET(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  await connectDB();
  const allowed = allowedContainerIds(employee);
  const filter = allowed ? { _id: { $in: allowed } } : {};
  const containers = await Container.find(filter).sort({ name: 1 }).select("name description cellCount firmId").lean();
  return NextResponse.json({
    containers: containers.map((c) => ({
      id: String(c._id),
      name: c.name,
      description: c.description,
      cellCount: c.cellCount,
      // Фирма по умолчанию для этого контейнера (см. models/Container.ts::firmId) — мастер
      // создания записи (NewRecordWizard) использует её, чтобы пропустить шаг "firm".
      firmId: c.firmId ? String(c.firmId) : null,
    })),
  });
}
