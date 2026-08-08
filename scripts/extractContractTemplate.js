/**
 * Одноразовый (но воспроизводимый) инструмент обслуживания шаблона договора.
 *
 * Читает templates/contract_template.docx, достаёт текст word/document.xml (включая
 * таблицы) в порядке документа, классифицирует абзацы (заголовок раздела / пронумерованный
 * пункт / маркированный пункт / служебные блоки) и генерирует lib/contract/contractTemplateBlocks.ts
 * — статический массив блоков, из которого lib/contract/generateContract.ts собирает PDF
 * (см. README, раздел «Договор для физических лиц»: почему PDF собирается программно,
 * а не через LibreOffice/docx→pdf).
 *
 * Запуск (только если сам .docx-шаблон изменился и блоки нужно перегенерировать):
 *   node scripts/extractContractTemplate.js
 *
 * Не тянет внешних зависимостей (ни npm-пакетов для zip, ни системного `unzip`) —
 * .docx это обычный ZIP (обычно без шифрования, записи хранятся как STORE(0) или DEFLATE(8)),
 * поэтому здесь минимальный самодостаточный ридер поверх встроенного zlib.
 *
 * ВАЖНО: после перегенерации обязательно вручную сверить templates/fonts/DejaVuSans*.ttf
 * содержат все нужные символы (см. README) — скрипт это не проверяет.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCX_PATH = path.join(__dirname, "../templates/contract_template.docx");
const OUT_PATH = path.join(__dirname, "../lib/contract/contractTemplateBlocks.ts");

// ---------- минимальный ZIP-ридер (только то, что нужно для .docx) ----------

function readZipEntry(buf, entryName) {
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Не найден EOCD — файл не похож на ZIP/.docx");

  const cdEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x02014b50) throw new Error("Повреждённая запись центрального каталога ZIP");
    const compMethod = buf.readUInt16LE(offset + 10);
    const compSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

    if (name === entryName) {
      // Локальный заголовок нужен, т.к. его extra-поле может отличаться по длине от того,
      // что указано в центральном каталоге.
      const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      if (compMethod === 0) return raw;
      if (compMethod === 8) return zlib.inflateRawSync(raw);
      throw new Error(`Неподдерживаемый метод сжатия ZIP: ${compMethod}`);
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`Запись "${entryName}" не найдена в архиве`);
}

// ---------- разбор word/document.xml в упорядоченный список блоков ----------

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textOfParagraph(pXml) {
  const texts = [...pXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]);
  return texts.join("");
}

function extractOrderedContent(xml) {
  const bodyMatch = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!bodyMatch) throw new Error("Не найден <w:body> в document.xml");
  const body = bodyMatch[1];

  const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
  const blocks = [];
  let m;
  while ((m = blockRe.exec(body))) blocks.push(m[0]);

  const result = [];
  for (const b of blocks) {
    if (b.startsWith("<w:tbl>")) {
      const rows = [...b.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)];
      const table = rows.map((r) => {
        const cells = [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)];
        return cells.map((c) => {
          const paras = [...c[0].matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((pp) =>
            decodeXmlEntities(textOfParagraph(pp[0]))
          );
          return paras.filter((x) => x.length > 0);
        });
      });
      result.push({ type: "table", rows: table });
    } else {
      const text = decodeXmlEntities(textOfParagraph(b)).trim();
      if (text.length) result.push({ type: "p", text });
    }
  }
  return result;
}

// ---------- классификация абзацев по стилю/номеру ----------

function classify(content) {
  const blocks = [];
  let idx = 0;
  for (const item of content) {
    if (item.type === "table") {
      blocks.push({ kind: "table-marker", rows: item.rows });
      idx++;
      continue;
    }
    const text = item.text;
    if (idx === 0) {
      blocks.push({ kind: "title", text: "САҚЛАШ ШАРТНОМАСИ" });
      idx++;
      continue;
    }
    if (idx === 1) {
      blocks.push({ kind: "subtitle", text });
      idx++;
      continue;
    }
    if (idx === 2) {
      blocks.push({ kind: "meta", text });
      idx++;
      continue;
    }
    if (idx === 3) {
      blocks.push({ kind: "intro", text });
      idx++;
      continue;
    }
    if (text === "ИЛОВА №1") {
      blocks.push({ kind: "appendixTitle", text });
      idx++;
      continue;
    }
    if (text === "САКЛАШ УЧУН ТАРИФ") {
      blocks.push({ kind: "appendixSubtitle", text });
      idx++;
      continue;
    }
    if (/^\d+\.\s+[А-ЯЎҚҒҲA-Z\s\-]+$/.test(text)) {
      blocks.push({ kind: "heading", text });
      idx++;
      continue;
    }
    if (/^\d+\.\d+\.\s/.test(text)) {
      blocks.push({ kind: "para", text });
      idx++;
      continue;
    }
    blocks.push({ kind: "bullet", text });
    idx++;
  }

  const tableMarkers = blocks.filter((b) => b.kind === "table-marker");
  if (tableMarkers.length !== 2) {
    throw new Error(
      `Ожидались ровно 2 таблицы в шаблоне (реквизиты + тариф), найдено ${tableMarkers.length}. ` +
        `Шаблон изменился структурно — проверьте вручную и поправьте lib/contract/generateContract.ts.`
    );
  }
  let seen = 0;
  for (const b of blocks) {
    if (b.kind === "table-marker") {
      b.kind = seen === 0 ? "signatureBlock" : "tariffBlock";
      seen++;
    }
  }

  const tailTexts = [
    "Подписи сторон:",
    "ХРАНИТЕЛЬ ___________________",
    "КЛИЕНТ ___________________",
  ];
  for (const b of blocks) {
    if (b.kind === "bullet" && tailTexts.includes(b.text)) {
      b.kind = b.text === "Подписи сторон:" ? "closingLabel" : "closingLine";
    }
  }

  return blocks;
}

function generateTs(blocks) {
  const lines = [];
  lines.push(
    "// АВТОСГЕНЕРИРОВАНО скриптом scripts/extractContractTemplate.js из templates/contract_template.docx."
  );
  lines.push("// Не редактировать руками: при изменении .docx-шаблона перезапустите скрипт.");
  lines.push(
    "// Текст на узбекском (кириллица) сохранён дословно из шаблона, включая плейсхолдеры <...>,"
  );
  lines.push("// которые подставляются в lib/contract/generateContract.ts.");
  lines.push("");
  lines.push("export type ContractBlock =");
  lines.push(
    '  | { kind: "title" | "subtitle" | "meta" | "intro" | "heading" | "para" | "bullet" | "appendixTitle" | "appendixSubtitle" | "closingLabel" | "closingLine"; text: string }'
  );
  lines.push('  | { kind: "signatureBlock" }');
  lines.push('  | { kind: "tariffBlock" };');
  lines.push("");
  lines.push("export const CONTRACT_BLOCKS: ContractBlock[] = [");
  for (const b of blocks) {
    if (b.kind === "signatureBlock" || b.kind === "tariffBlock") {
      lines.push(`  { kind: ${JSON.stringify(b.kind)} },`);
    } else {
      lines.push(`  { kind: ${JSON.stringify(b.kind)}, text: ${JSON.stringify(b.text)} },`);
    }
  }
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const zipBuf = fs.readFileSync(DOCX_PATH);
  const xmlBuf = readZipEntry(zipBuf, "word/document.xml");
  const xml = xmlBuf.toString("utf8");
  const content = extractOrderedContent(xml);
  const blocks = classify(content);
  const ts = generateTs(blocks);
  fs.writeFileSync(OUT_PATH, ts, "utf8");
  console.log(`Готово: ${blocks.length} блоков → ${path.relative(process.cwd(), OUT_PATH)}`);
}

main();
