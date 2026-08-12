import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Act } from "@/models/Act";
import { requireWebUser } from "@/lib/auth";
import { jsonError, contentDispositionHeader } from "@/lib/apiHelpers";

export const runtime = "nodejs";

/**
 * Отдаёт ранее сохранённый PDF акта (см. lib/contract/actPersistence.ts) — в отличие от
 * договора (app/api/records/[id]/contract/route.ts), НЕ пересобирается, а читается из БД как есть.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const act = await Act.findById(params.id).lean();
  if (!act) return jsonError("Акт не найден", 404);

  const baseName = act.filename.replace(/\.pdf$/i, "");
  return new NextResponse(new Uint8Array(act.pdfBuffer as unknown as Buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionHeader(baseName, "pdf", "inline"),
      "Cache-Control": "private, no-store",
    },
  });
}
