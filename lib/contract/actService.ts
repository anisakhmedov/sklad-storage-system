import { IStorageRecord } from "@/models/StorageRecord";
import { buildActFillData, renderActPdf, ActDirection, ActSubject } from "./generateAct";

const FILENAME_PREFIX: Record<ActSubject, Record<ActDirection, string>> = {
  goods: { given: "Akt_priema", returned: "Akt_otdachi" },
  inventory: { given: "Akt_peredachi_inventarya", returned: "Akt_vozvrata_inventarya" },
  boxes: { given: "Akt_peredachi_yashchikov", returned: "Akt_vozvrata_yashchikov" },
};

/**
 * Имя файла для отправки в Telegram (grammy InputFile) — кириллица там не проблема (в отличие
 * от HTTP Content-Disposition, см. lib/apiHelpers.ts::contentDispositionHeader), т.к. имя
 * передаётся как часть multipart-запроса к Telegram, а не как HTTP-заголовок.
 */
export function actFilename(
  subject: ActSubject,
  direction: ActDirection,
  ownerLabel: string,
  date = new Date()
): string {
  const prefix = FILENAME_PREFIX[subject][direction];
  const safeName = ownerLabel.trim().replace(/\s+/g, "_");
  const dateText = date.toLocaleDateString("ru-RU").replace(/\./g, "-");
  return `${prefix}_${safeName}_${dateText}.pdf`;
}

/** Акт по товару клиента (StorageRecord) нигде не хранится в промежуточном виде — собирается
 *  по актуальным данным записи и сразу сохраняется целиком через
 *  lib/contract/actPersistence.ts::createAndSaveAct. */
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
