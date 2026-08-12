import PDFDocument from "pdfkit";
import path from "path";
import { IStorageRecord } from "@/models/StorageRecord";
import { UNIT_LABELS } from "@/lib/labels";
import { ownerLabelOf } from "@/lib/ownerKey";

/**
 * PDF "Акт приёма-передачи товара" (direction: "given") или "Акт отдачи товара"
 * (direction: "returned") — оформляется автоматически при изменении количества груза у
 * уже существующего клиента (см. lib/contract/actService.ts,
 * app/api/miniapp/records/[id]/adjust/route.ts: delta > 0 → "given", delta < 0 → "returned").
 * Самостоятельный генератор (не переиспользует внутренности lib/contract/generateContract.ts),
 * чтобы не трогать уже отлаженный рендер договора — шрифты и общий стиль оформления те же.
 *
 * В отличие от договора, акт формируется и для физлиц, и для юрлиц (договор — только для
 * физлиц, см. generateContract.ts), поскольку акт приёма-передачи не содержит паспортных
 * данных, только факт изменения количества товара.
 */

const FONT_REGULAR = path.join(process.cwd(), "templates/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "templates/fonts/DejaVuSans-Bold.ttf");
const PAGE_MARGIN = 54;
const numberFmt = new Intl.NumberFormat("ru-RU");

export type ActDirection = "given" | "returned";

export interface ActFillData {
  direction: ActDirection;
  ownerLabel: string;
  containerName: string;
  productName: string;
  changedQuantityText: string;
  totalQuantityText: string;
  contractNumber?: string;
  dateText: string;
}

export function buildActFillData(
  record: Pick<IStorageRecord, "goodsOwner" | "productName" | "unit" | "contractNumber">,
  containerName: string,
  delta: number,
  totalAfter: number
): ActFillData {
  const unitLabel = UNIT_LABELS[record.unit] || record.unit;
  return {
    direction: delta > 0 ? "given" : "returned",
    ownerLabel: ownerLabelOf(record.goodsOwner),
    containerName,
    productName: record.productName,
    changedQuantityText: `${numberFmt.format(Math.abs(delta))} ${unitLabel}`,
    totalQuantityText: `${numberFmt.format(totalAfter)} ${unitLabel}`,
    contractNumber: record.contractNumber,
    dateText: new Date().toLocaleDateString("ru-RU"),
  };
}

export function renderActPdf(data: ActFillData): Promise<Buffer> {
  const isGiven = data.direction === "given";
  const titleUz = isGiven
    ? "ТОВАРНИ ҚАБУЛ ҚИЛИШ-ТОПШИРИШ ДАЛОЛАТНОМАСИ"
    : "ТОВАРНИ ҚАЙТАРИБ БЕРИШ ДАЛОЛАТНОМАСИ";
  const titleRu = isGiven ? "Акт приёма-передачи товара" : "Акт отдачи (возврата) товара";
  const introText = isGiven
    ? `«INTURIST MAROQAND» МЧЖ (Сақловчи) томонидан «${data.ownerLabel}» (Мижоз) га тегишли қуйидаги товар қабул қилиб олинди / ` +
      `ООО «INTURIST MAROQAND» (Хранитель) приняло на хранение от «${data.ownerLabel}» (Клиент) следующий товар:`
    : `«INTURIST MAROQAND» МЧЖ (Сақловчи) томонидан «${data.ownerLabel}» (Мижоз)га қуйидаги товар қайтариб берилди / ` +
      `ООО «INTURIST MAROQAND» (Хранитель) выдало (вернуло) со склада «${data.ownerLabel}» (Клиент) следующий товар:`;
  const quantityRowLabel = isGiven ? "Қўшилган миқдор / Добавлено" : "Берилган миқдор / Выдано (возвращено)";

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        info: { Title: titleRu, Author: "INTURIST MAROQAND" },
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
      doc.font("body").fontSize(10).text(titleRu, { align: "center" });
      doc.moveDown(0.4);

      doc.fontSize(9.5);
      doc.text(`Сана / Дата: ${data.dateText}`, doc.page.margins.left, doc.y, { width: contentWidth });
      if (data.contractNumber) {
        doc.text(`Шартнома № / Договор № ${data.contractNumber}`, doc.page.margins.left, doc.y, {
          width: contentWidth,
        });
      }
      doc.moveDown(0.8);

      doc.font("body").fontSize(10).text(introText, { align: "justify" });
      doc.moveDown(0.8);

      const leftX = doc.page.margins.left;
      const halfWidth = contentWidth / 2;
      const rowH = 22;
      const rows: Array<[string, string]> = [
        ["Контейнер / Container", data.containerName],
        ["Товар / Наименование товара", data.productName],
        [quantityRowLabel, data.changedQuantityText],
        ["Жами миқдор / Итого на хранении", data.totalQuantityText],
      ];

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
      doc.text("INTURIST MAROQAND МЧЖ", leftX, doc.y, { width: colWidth });
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
