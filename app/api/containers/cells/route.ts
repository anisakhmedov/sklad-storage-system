import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { getCellsGrid } from "@/lib/containerCells";
import { jsonError } from "@/lib/apiHelpers";

/** Сетка камер (2×4) по ВСЕМ контейнерам — секция "Контейнеры и камеры" на /dashboard и /dashboard/containers. */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const grid = await getCellsGrid();
  return NextResponse.json({ containers: grid });
}
