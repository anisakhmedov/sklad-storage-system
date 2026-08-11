import PDFDocument from "pdfkit";
import path from "path";
import { IStorageRecord } from "@/models/StorageRecord";
import { UNIT_LABELS } from "@/lib/labels";
import { ownerLabelOf } from "@/lib/ownerKey";

/**
 * PDF "Акт приёма-передачи товара" — оформляется автоматически при добавлении количества
 * груза уже существующему клиенту (см. lib/contract/actService.ts,
 * app/api/miniapp/records/[id]/adjust/route.ts). Самостоятельный генератор (не переиспользует
 * внутренности lib/contract/generateContract.ts), чтобы не трогать уже отлаженный рендер
 * договора — шрифты и общий стиль оформления те же.
 *
 * В отличие от договора, акт формируется и для физлиц, и для юрлиц (договор — только для
 * физлиц, см. generateContract.ts), поскольку акт приёма-передачи не содержит паспортных
 * данных, только факт добавления товара.
 */

const FONT_REGULAR = path.join(process.cwd(), "templates/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "templates/fonts/DejaVuSans-Bold.ttf");
const PAGE_MARGIN = 54;
const numberFmt = new Intl.NumberFormat("ru-RU");

export interface ActFillData {
  ownerLabel: string;
  containerName: string;
  productName: string;
  addedQuantityText: string;
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
    ownerLabel: ownerLabelOf(record.goodsOwner),
    containerName,
    productName: record.productName,
    addedQuantityText: `${numberFmt.format(delta)} ${unitLabel}`,
    totalQuantityText: `${numberFmt.format(totalAfter)} ${unitLabel}`,
    contractNumber: record.contractNumber,
    dateText: new Date().toLocaleDateString("ru-RU"),
  };
}

export function renderActPdf(data: ActFillData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        info: { Title: "Акт приёма-передачи товара", Author: "INTURIST MAROQAND" },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("body", FONT_REGULAR);
      doc.registerFont("bold", FONT_BOLD);
      doc.fillColor("#111111");

      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      doc.font("bold").fontSize(14).text("ТОВАРНИ ҚАБУЛ ҚИЛИШ-ТОПШИРИШ ДАЛОЛАТНОМАСИ", { align: "center" });
      doc.font("body").fontSize(10).text("Акт приёма-передачи товара", { align: "center" });
      doc.moveDown(0.4);

      doc.fontSize(9.5);
      doc.text(`Сана / Дата: ${data.dateText}`, doc.page.margins.left, doc.y, { width: contentWidth });
      if (data.contractNumber) {
        doc.text(`Шартнома № / Договор № ${data.contractNumber}`, doc.page.margins.left, doc.y, {
          width: contentWidth,
        });
      }
      doc.moveDown(0.8);

      doc.font("body").fontSize(10).text(
        `«INTURIST MAROQAND» МЧЖ (Сақловчи) томонидан «${data.ownerLabel}» (Мижоз) га тегишли қуйидаги товар қабул қилиб олинди / ` +
          `ООО «INTURIST MAROQAND» (Хранитель) приняло на хранение от «${data.ownerLabel}» (Клиент) следующий товар:`,
        { align: "justify" }
      );
      doc.moveDown(0.8);

      const leftX = doc.page.margins.left;
      const halfWidth = contentWidth / 2;
      const rowH = 22;
      const rows: Array<[string, string]> = [
        ["Контейнер / Container", data.containerName],
        ["Товар / Наименование товара", data.productName],
        ["Қўшилган миқдор / Добавлено", data.addedQuantityText],
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
