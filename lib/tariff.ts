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
// Месяц принят равным 30 дням — простое и предсказуемое приближение вместо календарных
// месяцев разной длины (см. README, раздел «Тарифы, оплата и задолженность»).
const DAYS_PER_MONTH = 30;

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, ms / MS_PER_DAY);
}

/**
 * Начисленная по тарифу сумма за период [from, to]. per_day/per_month — фиксированная
 * ставка за размещение целиком (не зависит от количества товара). per_kg_month/
 * per_kg_6_months — ставка за килограмм, пересчитанная пропорционально прошедшим дням.
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
      return (params.rate / DAYS_PER_MONTH) * days;
    case "per_kg_month": {
      const kg = quantityInKg(params.quantity, params.unit) ?? 0;
      return kg * (params.rate / DAYS_PER_MONTH) * days;
    }
    case "per_kg_6_months": {
      const kg = quantityInKg(params.quantity, params.unit) ?? 0;
      return kg * (params.rate / (DAYS_PER_MONTH * 6)) * days;
    }
  }
}
