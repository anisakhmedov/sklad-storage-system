// type-only импорт: этот модуль используется и в клиентских компонентах (Mini App, дашборд),
// поэтому важно, чтобы из models/StorageRecord.ts (тянет mongoose) не попало ничего в рантайм.
import type { Unit } from "@/models/StorageRecord";

/**
 * Тарифы за хранение — заменяют разовую "сумму оплаты", которая раньше вводилась сразу
 * при создании записи. Теперь запись фиксирует ДОГОВОРЁННЫЕ УСЛОВИЯ (тип тарифа + ставка),
 * а фактическая оплата вносится отдельно и когда угодно через lib/debt.ts + models/Income.ts
 * (см. README → «Тарифы, оплата и задолженность»).
 */
export type TariffType = "per_day" | "per_month" | "per_kg_month" | "per_kg_6_months";

export const TARIFF_TYPES: TariffType[] = ["per_day", "per_month", "per_kg_month", "per_kg_6_months"];

export const TARIFF_LABELS: Record<TariffType, string> = {
  per_day: "За день (фикс. за размещение)",
  per_month: "За месяц (фикс. за размещение)",
  per_kg_month: "За кг в месяц",
  per_kg_6_months: "За кг за 6 месяцев",
};

/** Короткая подпись для таблиц/сообщений, напр. "250 сум/кг в месяц". */
export function formatTariffText(tariff: { type: TariffType; rate: number }): string {
  const rate = new Intl.NumberFormat("ru-RU").format(tariff.rate);
  switch (tariff.type) {
    case "per_day":
      return `${rate} сум/день`;
    case "per_month":
      return `${rate} сум/месяц`;
    case "per_kg_month":
      return `${rate} сум/кг в месяц`;
    case "per_kg_6_months":
      return `${rate} сум/кг за 6 месяцев`;
  }
}

/** Значения по умолчанию — подставляются в форму при выборе типа тарифа, редактируемы. */
export const DEFAULT_TARIFF_RATES: Record<TariffType, number> = {
  per_day: 30,
  per_month: 9000,
  per_kg_month: 250,
  per_kg_6_months: 1000,
};

/**
 * per_kg_month / per_kg_6_months считаются от веса в килограммах — применимы только когда
 * единица измерения записи это "kg" или "tonne" (переводится в кг). Для "box"/"piece" вес
 * неизвестен, поэтому эти два типа тарифа для таких записей недоступны (см. валидацию в
 * lib/validation.ts и фильтрацию опций в NewRecordWizard/dashboard).
 */
export function tariffRequiresWeight(type: TariffType): boolean {
  return type === "per_kg_month" || type === "per_kg_6_months";
}

export function quantityInKg(quantity: number, unit: Unit): number | null {
  if (unit === "kg") return quantity;
  if (unit === "tonne") return quantity * 1000;
  return null;
}

export function isTariffCompatibleWithUnit(type: TariffType, unit: Unit): boolean {
  if (!tariffRequiresWeight(type)) return true;
  return quantityInKg(1, unit) !== null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Тот же сдвиг, что и в lib/patrols.ts::tashkentDateString — не импортируем оттуда напрямую,
// чтобы не тянуть mongoose в клиентский бандл (см. комментарий вверху файла: этот модуль
// используется и в компонентах). Нужен, чтобы "день" считался по календарю Ташкента, а не
// сервера (Vercel — UTC), иначе граница дня могла бы сдвигаться на несколько часов.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
// Месяц принят равным 30 дням — простое и предсказуемое приближение вместо календарных
// месяцев разной длины (см. README, раздел «Тарифы, оплата и задолженность»).
const DAYS_PER_MONTH = 30;

function tashkentCalendarDay(date: Date): number {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/**
 * Количество оплачиваемых дней между датой заключения договора и датой расчёта — ВКЛЮЧИТЕЛЬНО
 * считая день заключения (по решению владельца: "в первый день уже должен заплатить эту
 * сумму"). Пример: договор "за день" 100 000 сум — в день заключения уже начислено 100 000
 * (1 день), на следующий календарный день — 200 000 (2 дня). Считается по календарным датам
 * (Ташкент), а не по прошедшим часам — начисление "скачками" по дню, а не непрерывно.
 */
function daysBetween(from: Date, to: Date): number {
  const diff = Math.round((tashkentCalendarDay(to) - tashkentCalendarDay(from)) / MS_PER_DAY);
  if (diff < 0) return 0;
  return diff + 1;
}

/** Целых периодов "за месяц" (30 дней) в прошедших днях — округление ВВЕРХ: даже 1 день сверху
 * целого месяца начинает новый оплачиваемый месяц целиком (без поденной добивки внутри периода,
 * по решению владельца). */
function wholeMonths(days: number): number {
  return Math.ceil(days / DAYS_PER_MONTH);
}

/** То же самое для тарифа "за 6 месяцев" (180 дней) — свой период, не производный от wholeMonths. */
function wholeSixMonthPeriods(days: number): number {
  return Math.ceil(days / (DAYS_PER_MONTH * 6));
}

/**
 * Начисленная по тарифу сумма за период [from, to]. per_day — по дням (ставка × дни).
 * per_month/per_kg_month/per_kg_6_months — целыми оплачиваемыми периодами (месяц / полгода):
 * ставка за период умножается на число НАЧАВШИХСЯ периодов, без поденной добивки внутри периода
 * (см. wholeMonths/wholeSixMonthPeriods выше и README → «Тарифы, оплата и задолженность»).
 */
export function accrueTariff(params: {
  type: TariffType;
  rate: number;
  quantity: number;
  unit: Unit;
  from: Date;
  to: Date;
}): number {
  const days = daysBetween(params.from, params.to);
  switch (params.type) {
    case "per_day":
      return params.rate * days;
    case "per_month":
      return params.rate * wholeMonths(days);
    case "per_kg_month": {
      const kg = quantityInKg(params.quantity, params.unit) ?? 0;
      return kg * params.rate * wholeMonths(days);
    }
    case "per_kg_6_months": {
      const kg = quantityInKg(params.quantity, params.unit) ?? 0;
      return kg * params.rate * wholeSixMonthPeriods(days);
    }
  }
}

/**
 * Подсказка «когда клиент заберёт товар» — предлагается сотруднику при создании записи
 * (и пересчитывается при смене тарифа), но остаётся редактируемой (см. IStorageRecord →
 * expectedEndDate в models/StorageRecord.ts). per_month/per_kg_month — один оплаченный
 * период (30 дней) от даты договора, per_kg_6_months — полгода (180 дней). Для per_day
 * заранее известной длительности нет (платят посуточно, пока товар лежит) — подсказки нет,
 * поле остаётся пустым и целиком на усмотрение сотрудника.
 */
export function suggestedEndDate(type: TariffType, from: Date): Date | null {
  switch (type) {
    case "per_day":
      return null;
    case "per_month":
    case "per_kg_month":
      return new Date(from.getTime() + DAYS_PER_MONTH * MS_PER_DAY);
    case "per_kg_6_months":
      return new Date(from.getTime() + DAYS_PER_MONTH * 6 * MS_PER_DAY);
  }
}
