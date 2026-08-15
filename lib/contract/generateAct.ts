import PDFDocument from "pdfkit";
import path from "path";
import { IStorageRecord } from "@/models/StorageRecord";
import { UNIT_LABELS } from "@/lib/labels";
import { ownerLabelOf } from "@/lib/ownerKey";
import { DEFAULT_FIRM } from "./firmDefaults";

/**
 * PDF-рендерер актов — общий для трёх видов операций (см. models/Act.ts::ActKind):
 * "goods" (товар клиента, партия per-запись), "inventory" (складской инвентарь, выданный
 * клиенту, см. models/InventoryLedgerEntry.ts) и "boxes" (ящики под товар, см.
 * models/BoxLedgerEntry.ts). Вёрстка одна и та же (шапка/таблица/подписи), меняются только
 * заголовок и подписи строк — под конкретный предмет акта (subject).
 *
 * Самостоятельный генератор (не переиспользует внутренности lib/contract/generateContract.ts),
 * чтобы не трогать уже отлаженный рендер договора — шрифты и общий стиль оформления те же.
 * В отличие от договора, акт формируется и для физлиц, и для юрлиц (договор — только для
 * физлиц, см. generateContract.ts), поскольку акт приёма-передачи не содержит паспортных данных.
 *
 * Текст только на узбекском (кириллица) — раньше рядом с каждой строкой шёл русский перевод
 * через "/", убрано по решению владельца. Строка "Камера" добавлена в таблицу реквизитов —
 * раньше номер камеры сохранялся на Act (models/Act.ts::cellNumber), но в сам PDF не попадал.
 */

const FONT_REGULAR = path.join(process.cwd(), "templates/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "templates/fonts/DejaVuSans-Bold.ttf");
const PAGE_MARGIN = 54;
const numberFmt = new Intl.NumberFormat("ru-RU");

export type ActDirection = "given" | "returned";
export type ActSubject = "goods" | "inventory" | "boxes";

interface SubjectLabels {
  titleUz: (isGiven: boolean) => string;
  subjectWordUz: string; // "товар" на узбекском для вводного текста
  itemRowLabel: string; // подпись строки с наименованием предмета
  quantityRowLabel: (isGiven: boolean) => string;
}

const SUBJECT_LABELS: Record<ActSubject, SubjectLabels> = {
  goods: {
    titleUz: (g) => (g ? "ТОВАРНИ ҚАБУЛ ҚИЛИШ-ТОПШИРИШ ДАЛОЛАТНОМАСИ" : "ТОВАРНИ ҚАЙТАРИБ БЕРИШ ДАЛОЛАТНОМАСИ"),
    subjectWordUz: "товар",
    itemRowLabel: "Товар",
    quantityRowLabel: (g) => (g ? "Қўшилган миқдор" : "Берилган миқдор"),
  },
  inventory: {
    titleUz: (g) =>
      g ? "ИНВЕНТАРНИ ТОПШИРИШ ДАЛОЛАТНОМАСИ" : "ИНВЕНТАРНИ ҚАЙТАРИБ ОЛИШ ДАЛОЛАТНОМАСИ",
    subjectWordUz: "инвентар",
    itemRowLabel: "Инвентар",
    quantityRowLabel: (g) => (g ? "Берилган миқдор" : "Қайтарилган миқдор"),
  },
  boxes: {
    titleUz: (g) => (g ? "ЯЩИКЛАРНИ ТОПШИРИШ ДАЛОЛАТНОМАСИ" : "ЯЩИКЛАРНИ ҚАЙТАРИБ ОЛИШ ДАЛОЛАТНОМАСИ"),
    subjectWordUz: "ящик",
    itemRowLabel: "Ящиклар",
    quantityRowLabel: (g) => (g ? "Берилган миқдор" : "Қайтарилган миқдор"),
  },
};

export interface ActFillData {
  subject: ActSubject;
  direction: ActDirection;
  ownerLabel: string;
  containerName: string;
  /** Номер камеры — есть у товарных актов (StorageRecord.cellNumber всегда задан) и у
   * инвентарных (InventoryLedgerEntry.cellNumber необязателен); у актов по ящикам отсутствует
   * (BoxLedgerEntry камеру не хранит — ящики не привязаны к конкретной камере). Строка "Камера"
   * в PDF рисуется только когда значение есть. */
  cellNumber?: number;
  itemLabel: string; // наименование товара / позиции инвентаря / "Ящики"
  changedQuantityText: string;
  totalQuantityText?: string;
  contractNumber?: string;
  actNumber?: string;
  dateText: string;
  /** Фирма-подписант ("Сақловчи") — см. lib/contract/firmDefaults.ts. По умолчанию
   * DEFAULT_FIRM (акты по инвентарю/ящикам не привязаны к конкретной фирме записи). */
  firmName: string;
}

export function buildActFillData(
  record: Pick<IStorageRecord, "goodsOwner" | "productName" | "unit" | "contractNumber" | "issuingFirm" | "cellNumber">,
  containerName: string,
  delta: number,
  totalAfter: number
): ActFillData {
  const unitLabel = UNIT_LABELS[record.unit] || record.unit;
  return {
    subject: "goods",
    direction: delta > 0 ? "given" : "returned",
    ownerLabel: ownerLabelOf(record.goodsOwner),
    containerName,
    cellNumber: record.cellNumber,
    itemLabel: record.productName,
    changedQuantityText: `${numberFmt.format(Math.abs(delta))} ${unitLabel}`,
    totalQuantityText: `${numberFmt.format(totalAfter)} ${unitLabel}`,
    contractNumber: record.contractNumber,
    dateText: new Date().toLocaleDateString("ru-RU"),
    firmName: record.issuingFirm?.name || DEFAULT_FIRM.name,
  };
}

export function renderActPdf(data: ActFillData): Promise<Buffer> {
  const isGiven = data.direction === "given";
  const labels = SUBJECT_LABELS[data.subject];
  const titleUz = labels.titleUz(isGiven);
  const introText = isGiven
    ? `«${data.firmName}» (Сақловчи) томонидан «${data.ownerLabel}» (Мижоз) га тегишли қуйидаги ${labels.subjectWordUz} қабул қилиб олинди:`
    : `«${data.firmName}» (Сақловчи) томонидан «${data.ownerLabel}» (Мижоз)га қуйидаги ${labels.subjectWordUz} қайтариб берилди:`;
  const quantityRowLabel = labels.quantityRowLabel(isGiven);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        info: { Title: titleUz, Author: data.firmName },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("body", FONT_REGULAR);
      doc.registerFont("bold", FONT_BOLD);
      doc.fillColor("#111111");

      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.font("bold").fontSize(14).text(titleUz, { align: "center" });
      doc.moveDown(0.4);

      doc.fontSize(9.5);
      doc.text(`Сана: ${data.dateText}`, doc.page.margins.left, doc.y, { width: contentWidth });
      if (data.actNumber) {
        doc.text(`Далолатнома №: ${data.actNumber}`, doc.page.margins.left, doc.y, { width: contentWidth });
      }
      if (data.contractNumber) {
        doc.text(`Шартнома №: ${data.contractNumber}`, doc.page.margins.left, doc.y, {
          width: contentWidth,
        });
      }
      doc.moveDown(0.8);

      doc.font("body").fontSize(10).text(introText, { align: "justify" });
      doc.moveDown(0.8);

      const leftX = doc.page.margins.left;
      const halfWidth = contentWidth / 2;
      const rowH = 22;
      const rows: Array<[string, string]> = [["Контейнер", data.containerName]];
      if (data.cellNumber !== undefined) {
        rows.push(["Камера", String(data.cellNumber)]);
      }
      rows.push([labels.itemRowLabel, data.itemLabel], [quantityRowLabel, data.changedQuantityText]);
      if (data.totalQuantityText) {
        rows.push(["Жами миқдор", data.totalQuantityText]);
      }

      let y = doc.y;
      doc.lineWidth(0.75).strokeColor("#333333");
      for (const [label, value] of rows) {
        doc.rect(leftX, y, contentWidth, rowH).stroke();
        doc.moveTo(leftX + halfWidth, y).lineTo(leftX + halfWidth, y + rowH).stroke();
        doc.font("bold").fontSize(9.5).text(label, leftX + 6, y + 6, { width: halfWidth - 12 });
        doc.font("body").fontSize(9.5).text(value, leftX + halfWidth + 6, y + 6, { width: halfWidth - 12 });
        y += rowH;
      }
      doc.y = y + 20;

      const colWidth = contentWidth / 2 - 10;
      const rightX = leftX + contentWidth / 2 + 10;
      const sigY = doc.y;
      doc.font("bold").fontSize(10).text("Сақловчи", leftX, sigY, { width: colWidth });
      doc.font("body").fontSize(9.5);
      doc.text(data.firmName, leftX, doc.y, { width: colWidth });
      doc.text("________________________", leftX, doc.y, { width: colWidth });

      doc.font("bold").fontSize(10).text("Мижоз", rightX, sigY, { width: colWidth });
      doc.font("body").fontSize(9.5);
      doc.text(data.ownerLabel, rightX, doc.y, { width: colWidth });
      doc.text("________________________", rightX, doc.y, { width: colWidth });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
