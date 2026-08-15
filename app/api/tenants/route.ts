import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllTenants } from "@/lib/tenants";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const containerId = req.nextUrl.searchParams.get("containerId") || undefined;
    const tenants = await getAllTenants({ containerId });
    return NextResponse.json({ tenants });
  } catch (err) {
    console.error("GET /api/tenants:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
