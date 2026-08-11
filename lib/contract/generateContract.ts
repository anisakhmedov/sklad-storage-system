import PDFDocument from "pdfkit";
import path from "path";
import { CONTRACT_BLOCKS, ContractBlock } from "./contractTemplateBlocks";
import { IStorageRecord } from "@/models/StorageRecord";
import { formatTariffText } from "@/lib/tariff";

/**
 * Сборка PDF договора хранения для физлиц-арендаторов.
 *
 * ПОЧЕМУ ТАК (а не docx→pdf): конечный хостинг — Vercel serverless, где недоступен
 * LibreOffice/soffice "из коробки", а npm-пакеты, тянущие LibreOffice-бинарник, рискуют
 * не влезть в лимиты serverless-функции и дать нестабильный cold start. Вместо этого текст
 * шаблона (templates/contract_template.docx) один раз вытащен и классифицирован скриптом
 * scripts/extractContractTemplate.js в статический массив CONTRACT_BLOCKS, а PDF собирается
 * заново на каждый запрос напрямую через pdfkit (чистый JS, без нативных бинарников —
 * надёжно работает в serverless). Подробное обоснование выбора — в README.
 *
 * Кириллица (включая узбекские буквы Ў/Қ/Ғ/Ҳ, которых нет в стандартных 14 PDF-шрифтах)
 * рендерится встроенным шрифтом DejaVu Sans (templates/fonts/*.ttf, лицензия — см.
 * templates/fonts/LICENSE.txt), который проверен на полное покрытие символов шаблона.
 *
 * PDF нигде не хранится — генерируется по требованию из актуальных данных записи
 * (см. README → «Договор для физических лиц»).
 */

const FONT_REGULAR = path.join(process.cwd(), "templates/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.join(process.cwd(), "templates/fonts/DejaVuSans-Bold.ttf");

export interface ContractFillData {
  fullName: string;
  abbreviatedName: string;
  passportData: string;
  passportIssueDate: string;
  passportIssuedBy: string;
  pinfl: string;
  rentalInfo: string;
  tariffText: string;
  contractNumber: string;
}

/**
 * "Фамилия Имя Отчество" → "И. Фамилия" (напр. "Ахмедов Анисхон Равшанович" → "А. Ахмедов") —
 * формат для плейсхолдера `<Имя сокрощенное. Фамилия>` в колонке "КЛИЕНТ" блока подписи,
 * уточнено пользователем после первой версии (изначально плейсхолдер был непонятен и
 * оставался как есть — см. историю README).
 */
function abbreviateFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [surname, givenName] = parts;
  if (!givenName) return surname;
  return `${givenName[0].toUpperCase()}. ${surname}`;
}

/** Данные, сопоставленные с плейсхолдерами шаблона (см. таблицу в README, часть 3). */
export function buildContractFillData(
  record: Pick<IStorageRecord, "tariff" | "goodsOwner">,
  containerName: string,
  contractNumber: string
): ContractFillData {
  const owner = record.goodsOwner;
  if (owner.type !== "individual") {
    throw new Error("Договор формируется только для физических лиц (goodsOwner.type === 'individual')");
  }

  return {
    fullName: owner.fullName,
    abbreviatedName: abbreviateFullName(owner.fullName),
    passportData: owner.passportData,
    passportIssueDate: owner.passportIssueDate,
    passportIssuedBy: owner.passportIssuedBy,
    pinfl: owner.pinfl,
    // Раньше здесь также указывались название товара и количество — убрано по просьбе
    // пользователя: в ИЛОВА №1 рядом с тарифом должно быть только название контейнера,
    // без состава груза (см. README).
    rentalInfo: containerName,
    tariffText: formatTariffText(record.tariff),
    contractNumber,
  };
}

function placeholderMap(data: ContractFillData): Record<string, string> {
  return {
    "<ФИО>": data.fullName,
    "<Фамилия Имя Отчество>": data.fullName,
    "<Номер паспорта>": data.passportData,
    "<Дата выдачи>": data.passportIssueDate,
    "<Кем выдан>": data.passportIssuedBy,
    "<ПИФНЛ>": data.pinfl,
    "<Информация про всю аренду>": data.rentalInfo,
    "<Тариф>": data.tariffText,
    "<Имя сокрощенное. Фамилия>": data.abbreviatedName,
    "<Номер договора>": data.contractNumber,
  };
}

function fill(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}

const PAGE_MARGIN = 54;

/** Рендерит заполненный договор в PDF и возвращает его как Buffer. */
export function renderContractPdf(data: ContractFillData): Promise<Buffer> {
  const map = placeholderMap(data);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        bufferPages: true,
        info: { Title: "Договор хранения", Author: "INTURIST MAROQAND" },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.registerFont("body", FONT_REGULAR);
      doc.registerFont("bold", FONT_BOLD);
      doc.lineWidth(0.75).strokeColor("#333333").fillColor("#111111");

      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      for (const block of CONTRACT_BLOCKS) {
        renderBlock(doc, block, map, data, contentWidth);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function renderBlock(
  doc: PDFKit.PDFDocument,
  block: ContractBlock,
  map: Record<string, string>,
  data: ContractFillData,
  contentWidth: number
) {
  switch (block.kind) {
    case "title":
      doc.font("bold").fontSize(14).text(fill(block.text, map), { align: "center" });
      doc.moveDown(0.3);
      break;

    case "subtitle":
      doc.font("body").fontSize(10).text(fill(block.text, map), { align: "center" });
      doc.moveDown(0.6);
      break;

    case "meta": {
      const parts = block.text.split(/\s{2,}/).filter(Boolean);
      doc.font("body").fontSize(9.5);
      if (parts.length === 2) {
        const y = doc.y;
        doc.text(fill(parts[0], map), doc.page.margins.left, y, { width: contentWidth });
        doc.text(fill(parts[1], map), doc.page.margins.left, y, { width: contentWidth, align: "right" });
      } else {
        doc.text(fill(block.text, map));
      }
      doc.moveDown(0.8);
      break;
    }

    case "intro":
      doc.font("body").fontSize(10).text(fill(block.text, map), { align: "justify" });
      doc.moveDown(0.6);
      break;

    case "heading":
      ensureSpace(doc, 40);
      doc.moveDown(0.4);
      doc.font("bold").fontSize(11).text(fill(block.text, map));
      doc.moveDown(0.25);
      break;

    case "para":
      doc.font("body").fontSize(9.5).text(fill(block.text, map), { align: "justify" });
      doc.moveDown(0.2);
      break;

    case "bullet":
      doc
        .font("body")
        .fontSize(9.5)
        .text(`•  ${fill(block.text, map)}`, { align: "justify", indent: 12 });
      doc.moveDown(0.15);
      break;

    case "appendixTitle":
      doc.addPage();
      doc.font("bold").fontSize(13).text(fill(block.text, map), { align: "center" });
      doc.moveDown(0.3);
      break;

    case "appendixSubtitle":
      doc.font("bold").fontSize(10.5).text(fill(block.text, map), { align: "center" });
      doc.moveDown(0.6);
      break;

    case "closingLabel":
      ensureSpace(doc, 60);
      doc.moveDown(0.6);
      doc.font("bold").fontSize(10).text(fill(block.text, map));
      doc.moveDown(0.3);
      break;

    case "closingLine":
      doc.font("body").fontSize(10).text(fill(block.text, map));
      doc.moveDown(0.2);
      break;

    case "signatureBlock":
      renderSignatureBlock(doc, map, contentWidth);
      break;

    case "tariffBlock":
      renderTariffBlock(doc, data, contentWidth);
      break;
  }
}

/** Двухколоночный блок реквизитов/подписей (раздел 11 шаблона). */
function renderSignatureBlock(doc: PDFKit.PDFDocument, map: Record<string, string>, contentWidth: number) {
  ensureSpace(doc, 170);
  doc.moveDown(0.3);

  const colWidth = contentWidth / 2 - 10;
  const leftX = doc.page.margins.left;
  const rightX = leftX + contentWidth / 2 + 10;
  const startY = doc.y;

  doc.font("bold").fontSize(10).text("ХРАНИТЕЛЬ", leftX, startY, { width: colWidth });
  doc.font("body").fontSize(9.5);
  doc.text("INTURIST MAROQAND МЧЖ", leftX, doc.y, { width: colWidth });
  doc.text("Самарқанд вилояти, Булунғур тумани", leftX, doc.y, { width: colWidth });
  doc.text('ТОШКЕНТ Ш., "ТУРОНБАНК" АТ БАНКИНИНГ БОШ ОФИСИ', leftX, doc.y, { width: colWidth });
  doc.text("х/р 20208000500771510001", leftX, doc.y, { width: colWidth });
  doc.text("ИНН: 304871250", leftX, doc.y, { width: colWidth });
  doc.text("БАНК КОДИ: 00446", leftX, doc.y, { width: colWidth });
  const leftEndY = doc.y;

  doc.font("bold").fontSize(10).text("КЛИЕНТ", rightX, startY, { width: colWidth });
  doc.font("body").fontSize(9.5);
  doc.text(fill("<Фамилия Имя Отчество>", map), rightX, doc.y, { width: colWidth });
  doc.text(fill("<Кем выдан>", map), rightX, doc.y, { width: colWidth });
  doc.text(fill("ПИНФЛ: <ПИФНЛ>", map), rightX, doc.y, { width: colWidth });
  doc.text(fill("ПАСПОРТ <Номер паспорта>", map), rightX, doc.y, { width: colWidth });
  const rightEndY = doc.y;

  doc.y = Math.max(leftEndY, rightEndY);
  doc.moveDown(0.8);

  const sigY = doc.y;
  doc.font("body").fontSize(9.5);
  doc.text("Директор", leftX, sigY, { width: colWidth });
  doc.text("________________________", leftX, doc.y, { width: colWidth });
  doc.text("О.Рахимов", leftX, doc.y, { width: colWidth });

  // Ранее здесь перед сокращённым именем арендатора стояло статичное "Ж.Сулаймонов"
  // (имя подписанта со стороны "Сақловчи", не относящееся к арендатору) — убрано по
  // просьбе пользователя, в колонке "КЛИЕНТ" должно быть только сокращённое имя арендатора.
  doc.text("________________________*", rightX, sigY, { width: colWidth });
  doc.text(fill("<Имя сокрощенное. Фамилия>", map), rightX, doc.y, { width: colWidth });

  doc.moveDown(1);
}

/** Приложение №1 — таблица "Тариф" (раздел ИЛОВА №1 шаблона). */
function renderTariffBlock(doc: PDFKit.PDFDocument, data: ContractFillData, contentWidth: number) {
  ensureSpace(doc, 90);
  doc.moveDown(0.2);

  const leftX = doc.page.margins.left;
  const halfWidth = contentWidth / 2;
  const headerH = 20;
  const valueH = 40;
  const y0 = doc.y;

  doc.lineWidth(0.75).strokeColor("#333333");
  doc.rect(leftX, y0, contentWidth, headerH).stroke();
  doc.rect(leftX, y0 + headerH, contentWidth, valueH).stroke();
  doc
    .moveTo(leftX + halfWidth, y0)
    .lineTo(leftX + halfWidth, y0 + headerH + valueH)
    .stroke();

  doc.font("bold").fontSize(10);
  doc.text("Саклаш Тури", leftX + 6, y0 + 5, { width: halfWidth - 12 });
  doc.text("Тариф", leftX + halfWidth + 6, y0 + 5, { width: halfWidth - 12 });

  doc.font("body").fontSize(9.5);
  doc.text(data.rentalInfo, leftX + 6, y0 + headerH + 6, { width: halfWidth - 12 });
  doc.text(data.tariffText, leftX + halfWidth + 6, y0 + headerH + 6, { width: halfWidth - 12 });

  doc.y = y0 + headerH + valueH + 12;
}
