import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Firm } from "@/models/Firm";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";

/**
 * Список фирм владельца для выбора "от чьего имени составляется договор" при создании записи
 * (см. components/miniapp/NewRecordWizard.tsx). Сотрудник только читает — управляют фирмами
 * исключительно на веб-панели (app/api/firms/route.ts, owner-only).
 */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    await connectDB();
    const firms = await Firm.find().sort({ name: 1 }).select("name directorFullName directorShortName address bankBranch bankAccount inn bankCode").lean();
    return NextResponse.json({
      firms: firms.map((f) => ({ id: String(f._id), ...f, _id: undefined })),
    });
  } catch (err) {
    console.error("GET /api/miniapp/firms:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
