import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError, contentDispositionHeader } from "@/lib/apiHelpers";
import { getAllTenantDetails, buildAllTenantsWorkbook } from "@/lib/tenants";

export const runtime = "nodejs";

/** Один .xlsx со всеми арендаторами разом — кнопка «Скачать всех» на /dashboard/tenants. */
export async function GET(_req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const details = await getAllTenantDetails();
    const buffer = await buildAllTenantsWorkbook(details);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader(
          `arendatory-vse-${new Date().toISOString().slice(0, 10)}`,
          "xlsx"
        ),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/tenants/export:", err);
    return jsonError("Не удалось сформировать Excel-файл", 500);
  }
}
