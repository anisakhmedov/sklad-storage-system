import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodErrorResponse(err: ZodError) {
  const message = err.issues.map((i) => i.message).join("; ");
  return jsonError(message, 400);
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * HTTP-заголовки обязаны быть ASCII — Node бросает исключение (ERR_INVALID_CHAR) при попытке
 * установить заголовок со значением вне Latin-1 (напр. кириллица в filename), из-за чего
 * скачивание падало с ошибкой сервера (см. историю бага с экспортом арендаторов в Excel).
 * Отдаём ASCII-запасной вариант в filename= и настоящее имя — в filename*= (RFC 5987), как
 * это принято для не-ASCII имён файлов. Используется и Excel-выгрузкой (lib/tenants.ts), и
 * скачиванием договора/акта (lib/contract/*).
 */
export function contentDispositionHeader(
  baseName: string,
  ext: string,
  disposition: "inline" | "attachment" = "attachment"
): string {
  const asciiBase = baseName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "file";
  return `${disposition}; filename="${asciiBase}.${ext}"; filename*=UTF-8''${encodeURIComponent(baseName)}.${ext}`;
}
