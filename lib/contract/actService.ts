import { ActDirection, ActSubject } from "./generateAct";

const FILENAME_PREFIX: Record<ActSubject, Record<ActDirection, string>> = {
  goods: { given: "Akt_priema", returned: "Akt_otdachi" },
  inventory: { given: "Akt_peredachi_inventarya", returned: "Akt_vozvrata_inventarya" },
  boxes: { given: "Akt_peredachi_yashchikov", returned: "Akt_vozvrata_yashchikov" },
};

/**
 * Имя файла для отправки в Telegram (grammy InputFile) — кириллица там не проблема (в отличие
 * от HTTP Content-Disposition, см. lib/apiHelpers.ts::contentDispositionHeader), т.к. имя
 * передаётся как часть multipart-запроса к Telegram, а не как HTTP-заголовок. Используется и
 * при отправке акта (lib/contract/actPersistence.ts::createAndSaveAct — задаёт Act.filename),
 * и при раздаче сохранённого PDF (app/api/acts/[id]/pdf/route.ts берёт готовое имя оттуда же).
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
