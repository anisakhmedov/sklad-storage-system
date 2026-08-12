import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantDetail } from "@/lib/tenants";

export async function GET(_req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const detail = await getTenantDetail(decodeURIComponent(params.ownerKey));
    if (!detail) return jsonError("Арендатор не найден", 404);

    return NextResponse.json({ detail });
  } catch (err) {
    console.error("GET /api/tenants/[ownerKey]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
