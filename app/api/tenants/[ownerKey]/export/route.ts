import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantDetail, buildTenantWorkbook, contentDispositionHeader } from "@/lib/tenants";

export const runtime = "nodejs";

/** Скачивание полной карточки арендатора в .xlsx — та же информация, что и в онлайн-версии. */
export async function GET(_req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const ownerKey = decodeURIComponent(params.ownerKey);
    const detail = await getTenantDetail(ownerKey);
    if (!detail) return jsonError("Арендатор не найден", 404);

    const buffer = await buildTenantWorkbook(detail);
    const label = detail.profile.type === "individual" ? detail.profile.fullName : detail.profile.companyName;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionHeader(`arendator-${label}`, "xlsx"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/tenants/[ownerKey]/export:", err);
    return jsonError("Не удалось сформировать Excel-файл", 500);
  }
}
