import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError, contentDispositionHeader } from "@/lib/apiHelpers";
import { getContractForRecordId } from "@/lib/contract/contractService";

export const runtime = "nodejs";

/**
 * Кнопка "Договор" на веб-панели (раздел «Записи») — часть 3 ТЗ. Договор нигде не хранится,
 * а собирается заново на каждый запрос из актуальных данных записи (см. lib/contract/generateContract.ts).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const result = await getContractForRecordId(params.id);
  if (result === "not_found") return jsonError("Запись не найдена", 404);
  if (result === "not_individual") {
    return jsonError("Договор формируется только для физических лиц", 400);
  }

  // result.filename кириллический (ФИО + дата, см. contractFilename) — заголовку нужна
  // ASCII-safe кодировка (см. lib/apiHelpers.ts::contentDispositionHeader).
  const baseName = result.filename.replace(/\.pdf$/i, "");
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionHeader(baseName, "pdf", "inline"),
      "Cache-Control": "private, no-store",
    },
  });
}
