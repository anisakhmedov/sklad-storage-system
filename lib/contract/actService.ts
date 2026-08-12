import { IStorageRecord } from "@/models/StorageRecord";
import { buildActFillData, renderActPdf, ActDirection } from "./generateAct";

/**
 * Имя файла для отправки в Telegram (grammy InputFile) — кириллица там не проблема (в отличие
 * от HTTP Content-Disposition, см. lib/apiHelpers.ts::contentDispositionHeader), т.к. имя
 * передаётся как часть multipart-запроса к Telegram, а не как HTTP-заголовок.
 */
export function actFilename(direction: ActDirection, ownerLabel: string, date = new Date()): string {
  const prefix = direction === "given" ? "Akt_priema" : "Akt_otdachi";
  const safeName = ownerLabel.trim().replace(/\s+/g, "_");
  const dateText = date.toLocaleDateString("ru-RU").replace(/\./g, "-");
  return `${prefix}_${safeName}_${dateText}.pdf`;
}

/** Акт нигде не хранится — собирается по актуальным данным записи в момент изменения количества. */
export async function generateActBuffer(
  record: Pick<IStorageRecord, "goodsOwner" | "productName" | "unit" | "contractNumber">,
  containerName: string,
  delta: number,
  totalAfter: number
): Promise<Buffer> {
  const data = buildActFillData(record, containerName, delta, totalAfter);
  return renderActPdf(data);
}

export function actDirectionOf(delta: number): ActDirection {
  return delta > 0 ? "given" : "returned";
}
