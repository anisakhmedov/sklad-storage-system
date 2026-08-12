import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TransportContainer } from "@/models/TransportContainer";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";

/** Список контейнеров для перевозки — для отметки "свободен" сотрудником в Mini App. */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    await connectDB();
    const containers = await TransportContainer.find().sort({ label: 1 }).lean();
    return NextResponse.json({ containers });
  } catch (err) {
    console.error("GET /api/miniapp/transport-containers:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
