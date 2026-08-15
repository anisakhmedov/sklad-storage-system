import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError, contentDispositionHeader } from "@/lib/apiHelpers";
import { getTenantDetail, buildTenantWorkbook } from "@/lib/tenants";

export const runtime = "nodejs";

/** Скачивание полной карточки арендатора в .xlsx — та же информация, что и в онлайн-версии. */
export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const clientId = decodeURIComponent(params.clientId);
    const detail = await getTenantDetail(clientId);
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
    console.error("GET /api/tenants/[clientId]/export:", err);
    return jsonError("Не удалось сформировать Excel-файл", 500);
  }
}
