import { connectDB } from "@/lib/db";
import { StorageRecord, IStorageRecord } from "@/models/StorageRecord";
import { GoodsOwnerLink, IGoodsOwnerLink } from "@/models/GoodsOwnerLink";
import { normalizePhone } from "@/lib/phone";
import { UNIT_LABELS } from "@/lib/labels";
import { formatTariffText } from "@/lib/tariff";
import { GoodsOwnerSummary } from "@/lib/reports";

/**
 * Общая логика идентификации/сообщений для владельцев груза (арендаторов), которые пишут
 * боту напрямую в чат (не через Mini App) — часть 2 и часть 3 ТЗ. Используется из
 * lib/telegramBot.ts (входящие апдейты бота) и lib/telegramNotify.ts (исходящие уведомления
 * из API-роутов Mini App).
 */

// ---------------------------------------------------------------------------
// Распознавание ключевых слов в свободном тексте (простое, по подстроке —
// аналогично тому, как в части 2 распознавалось слово «отчёт»).
// ---------------------------------------------------------------------------

export function isReportRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /отч[её]т|сводк|мои товар|долг|задолж/.test(t);
}

export function isContractRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /договор/.test(t);
}

export function isDeclineKeyboard(text: string): boolean {
  return text.trim().toLowerCase() === "не сейчас";
}

// ---------------------------------------------------------------------------
// Идентификация по номеру телефона (см. README → «Уведомления и сводка владельцам груза»).
// ---------------------------------------------------------------------------

export interface IdentifyResult {
  matched: boolean;
  fullName?: string;
}

/**
 * Ищет физлиц-арендаторов с данным (уже нормализованным) телефоном среди StorageRecord.
 * Возвращает ФИО из самой свежей совпавшей записи — используется и как имя для приветствия,
 * и как fullName, который сохраняется в GoodsOwnerLink.
 */
export async function identifyOwnerByPhone(phone: string): Promise<IdentifyResult> {
  await connectDB();
  const match = await StorageRecord.findOne({ "goodsOwner.type": "individual", "goodsOwner.phone": phone })
    .sort({ createdAt: -1 })
    .lean();
  if (!match || match.goodsOwner.type !== "individual") return { matched: false };
  return { matched: true, fullName: match.goodsOwner.fullName };
}

export async function linkGoodsOwner(telegramId: string, phone: string, fullName: string): Promise<void> {
  await connectDB();
  await GoodsOwnerLink.findOneAndUpdate(
    { telegramId },
    { telegramId, phone, fullName, linkedAt: new Date() },
    { upsert: true }
  );
}

export async function getGoodsOwnerLinkByTelegramId(telegramId: string): Promise<IGoodsOwnerLink | null> {
  await connectDB();
  return GoodsOwnerLink.findOne({ telegramId }).lean();
}

/**
 * Для уведомления при создании записи (часть 2): у одного номера в теории могло привязаться
 * больше одного telegramId (например, разные аккаунты одной семьи) — берём самую свежую
 * привязку, это задокументированное упрощение (см. README).
 */
export async function getGoodsOwnerLinkByPhone(phone: string): Promise<IGoodsOwnerLink | null> {
  await connectDB();
  return GoodsOwnerLink.findOne({ phone }).sort({ linkedAt: -1 }).lean();
}

// ---------------------------------------------------------------------------
// Форматирование сообщений
// ---------------------------------------------------------------------------

/** Экранирует символы, которые ломают Telegram Markdown (legacy), для интерполируемых строк. */
function escapeMd(s: string): string {
  return s.replace(/([_*`[])/g, "\\$1");
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("ru-RU");
}

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

/**
 * ✅ Ваш товар успешно зарегистрирован. — уведомление владельцу груза сразу после того,
 * как сотрудник создал запись с его номером телефона (часть 2 ТЗ). Без паспортных данных/ПИНФЛ.
 */
export function formatRegisteredMessage(
  record: Pick<IStorageRecord, "productName" | "quantity" | "unit" | "tariff" | "createdAt">,
  containerName: string
): string {
  const unitLabel = UNIT_LABELS[record.unit] || record.unit;
  return [
    "✅ Ваш товар успешно зарегистрирован.",
    `Контейнер: ${containerName}`,
    `Товар: ${record.productName}, ${record.quantity} ${unitLabel}`,
    `Дата: ${formatDate(record.createdAt)}`,
    `Тариф за хранение: ${formatTariffText(record.tariff)}`,
  ].join("\n");
}

/**
 * Сводка по товарам и задолженности владельца груза — по запросу
 * («отчёт»/«сводка»/«долг»/«задолженность»/`/report`).
 */
export function formatOwnerSummaryMessage(ownerName: string, summary: GoodsOwnerSummary): string {
  const lines: string[] = [];
  lines.push(`*Сводка по вашим товарам* — ${escapeMd(ownerName)}`);
  lines.push("");

  for (const c of summary.containers) {
    lines.push(`📦 *${escapeMd(c.containerName)}*`);
    const byUnit = new Map<string, number>();
    for (const item of c.items) {
      byUnit.set(item.unit, (byUnit.get(item.unit) || 0) + item.quantity);
    }
    for (const [unit, qty] of byUnit) {
      lines.push(`   ${formatMoney(qty)} ${UNIT_LABELS[unit as keyof typeof UNIT_LABELS] || unit}`);
    }
    lines.push(`   Последнее поступление: ${formatDate(c.lastDate)}`);
    lines.push(`   Начислено: ${formatMoney(c.accrued)} сум · Оплачено: ${formatMoney(c.paid)} сум`);
    lines.push(
      c.balance > 0
        ? `   ⚠️ Задолженность: ${formatMoney(c.balance)} сум`
        : c.balance < 0
        ? `   ✅ Переплата: ${formatMoney(-c.balance)} сум`
        : `   ✅ Задолженности нет`
    );
    lines.push("");
  }

  lines.push(`💰 Всего начислено: ${formatMoney(summary.totalAccrued)} сум`);
  lines.push(`💵 Всего оплачено: ${formatMoney(summary.totalPaid)} сум`);
  lines.push(
    summary.totalBalance > 0
      ? `⚠️ *Итоговая задолженность: ${formatMoney(summary.totalBalance)} сум* (на ${formatDate(summary.to)})`
      : `✅ *Задолженности нет* (на ${formatDate(summary.to)})`
  );

  return lines.join("\n");
}

export const OWNER_HELP_TEXT =
  "Напишите «отчёт» — пришлю сводку по вашим товарам, или «договор» — пришлю PDF договора " +
  "(если он у вас есть). Команды: /report, /contract.";

export const ASK_PHONE_TEXT =
  "Если вы владелец груза (арендатор) — поделитесь номером телефона, чтобы мы могли " +
  "присылать вам уведомления о поступлении товара и сводку по вашим записям. Нажмите кнопку ниже.";

export const NOT_FOUND_TEXT =
  "Записей с таким номером телефона не найдено. Если вы уверены, что это ошибка, " +
  "обратитесь к сотруднику склада или владельцу — возможно, номер был указан иначе.";

export const CONTACT_MISMATCH_TEXT =
  "Пожалуйста, поделитесь именно своим номером телефона через кнопку ниже (пересланный чужой контакт не подходит).";
