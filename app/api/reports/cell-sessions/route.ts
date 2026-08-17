import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getCellSessions } from "@/lib/cellSessions";

/** Отчёт «Заполненность камер» — сессии камеры от "заехал первый после пустоты" до "камера снова
 * полностью опустела" (см. lib/cellSessions.ts). containerId опционально сужает до одного
 * контейнера, как и в остальных отчётах/сетках (см. lib/containerCells.ts::getCellsGrid). */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const containerId = req.nextUrl.searchParams.get("containerId");
    const sections = await getCellSessions(containerId ? [containerId] : undefined);
    return NextResponse.json({ sections });
  } catch (err) {
    console.error("GET /api/reports/cell-sessions:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
