import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getTenantDetail, buildTenantWorkbook } from "@/lib/tenants";

export const runtime = "nodejs";

/** Скачивание полной карточки арендатора в .xlsx — та же информация, что и в онлайн-версии. */
export async function GET(_req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const ownerKey = decodeURIComponent(params.ownerKey);
  const detail = await getTenantDetail(ownerKey);
  if (!detail) return jsonError("Арендатор не найден", 404);

  const buffer = await buildTenantWorkbook(detail);
  const label = detail.profile.type === "individual" ? detail.profile.fullName : detail.profile.companyName;
  const filename = `arendator-${label.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]+/g, "_")}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
