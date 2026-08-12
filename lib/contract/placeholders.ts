import type { IStorageRecord } from "@/models/StorageRecord";
import { formatTariffText } from "@/lib/tariff";

/**
 * Текстовая логика заполнения договора (плейсхолдеры, форматирование даты) — БЕЗ
 * Node-only зависимостей (`pdfkit`, `path`), намеренно вынесена из
 * lib/contract/generateContract.ts в отдельный файл. Причина: этот же код нужен и на
 * сервере (сборка PDF), и в браузере — показать клиенту читаемый текст договора прямо в
 * Mini App перед подписью (см. components/miniapp/ContractPreview.tsx, шаг "Договор" в
 * components/miniapp/NewRecordWizard.tsx). Импорт generateContract.ts из клиентского
 * компонента сломал бы браузерный бандл (pdfkit/path — Node-only).
 */

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
  formattedDate: string;
  /** PNG-подпись клиента (см. models/StorageRecord.ts::clientSignaturePng) — используется
   * только на сервере при рендере PDF (lib/contract/generateContract.ts::renderSignatureBlock),
   * в браузерном превью текста не участвует. */
  signatureImage?: Buffer;
}

const MONTH_ABBR = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

/**
 * Дата оформления в формате исходного .docx-шаблона: «20» Июл 2026й. — день в кавычках-
 * «ёлочках», сокращённое русское название месяца (3 буквы, без точки) и год с суффиксом
 * «й.» (сокращение узб. «йил» — «год»). Вычисляется из даты договора (`record.createdAt`,
 * редактируется на веб-панели, см. app/dashboard/records/page.tsx), той же даты, что
 * используется в имени файла договора (см. lib/contract/contractService.ts::contractFilename).
 */
export function formatContractDate(date: Date): string {
  const day = date.getDate();
  const month = MONTH_ABBR[date.getMonth()];
  const year = date.getFullYear();
  return `«${day}» ${month} ${year}й.`;
}

/**
 * "Фамилия Имя Отчество" → "И. Фамилия" (напр. "Ахмедов Анисхон Равшанович" → "А. Ахмедов") —
 * формат для плейсхолдера `<Имя сокрощенное. Фамилия>` в колонке "КЛИЕНТ" блока подписи.
 */
export function abbreviateFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const [surname, givenName] = parts;
  if (!givenName) return surname;
  return `${givenName[0].toUpperCase()}. ${surname}`;
}

/** Данные, сопоставленные с плейсхолдерами шаблона (см. таблицу в README, часть 3). */
export function buildContractFillData(
  record: Pick<IStorageRecord, "tariff" | "goodsOwner" | "createdAt" | "clientSignaturePng">,
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
    formattedDate: formatContractDate(record.createdAt),
    signatureImage: record.clientSignaturePng,
  };
}

export function placeholderMap(data: ContractFillData): Record<string, string> {
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
    "<Дата оформления>": data.formattedDate,
  };
}

export function fill(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [token, value] of Object.entries(map)) {
    out = out.split(token).join(value);
  }
  return out;
}
