/**
 * Структура камер хранения внутри контейнера. Раньше количество камер было единой константой,
 * одинаковой для ВСЕХ контейнеров (фиксированная сетка 2×4) и не хранилось как отдельная
 * сущность в БД. Теперь количество камер редактируется индивидуально на контейнер (см.
 * models/Container.ts::cellCount, страница /dashboard/containers) — DEFAULT_CELL_COUNT
 * остаётся значением по умолчанию для новых контейнеров и запасным вариантом для контейнеров,
 * созданных до этой доработки (у них cellCount отсутствует в БД).
 *
 * MAX_CELL_COUNT — верхняя граница на уровне схем/валидации (второй рубеж защиты, см.
 * lib/validation.ts, models/StorageRecord.ts и т.д.) — сама по себе не привязана к конкретному
 * контейнеру, реальный лимит для конкретного контейнера — его собственный cellCount.
 */
export const DEFAULT_CELL_COUNT = 8;
export const MAX_CELL_COUNT = 60;
// Оставлено под старым именем для обратной совместимости с местами, которые ещё не стали
// контейнеро-зависимыми (mini app, см. components/miniapp/CellGrid.tsx и др.) — всегда 8.
export const CELL_COUNT = DEFAULT_CELL_COUNT;
export const CELL_NUMBERS = Array.from({ length: CELL_COUNT }, (_, i) => i + 1);

/** Список номеров камер 1..count для конкретного контейнера (см. Container.cellCount). */
export function cellNumbersForCount(count: number): number[] {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : DEFAULT_CELL_COUNT;
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function isValidCellNumber(n: unknown, count: number = CELL_COUNT): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= count;
}
