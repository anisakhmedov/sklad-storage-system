import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError, contentDispositionHeader } from "@/lib/apiHelpers";
import { getTenantMatrix, buildTenantMatrixWorkbook } from "@/lib/tenantMatrix";

export const runtime = "nodejs";

/** .xlsx сводной таблицы «Арендаторы по камерам» — кнопка «Экспорт в Excel» на этом виде. */
export async function GET(_req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const sections = await getTenantMatrix();
    const buffer = await buildTenantMatrixWorkbook(sections);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader(
          `arendatory-po-kameram-${new Date().toISOString().slice(0, 10)}`,
          "xlsx"
        ),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/tenants/matrix/export:", err);
    return jsonError("Не удалось сформировать Excel-файл", 500);
  }
}
