/**
 * Структура камер хранения внутри контейнера — фиксированная сетка 2×4 (см. README /
 * app/dashboard/page.tsx, components/miniapp/NewRecordWizard.tsx). Количество камер
 * одинаково для ВСЕХ контейнеров и не хранится как отдельная сущность в БД — только эта
 * константа. Занятость камеры вычисляется из активных StorageRecord (см.
 * lib/containerCells.ts), а флажок "заполнена" хранится в Container.fullCells.
 */
export const CELL_COUNT = 8;
export const CELL_NUMBERS = Array.from({ length: CELL_COUNT }, (_, i) => i + 1);

export function isValidCellNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= CELL_COUNT;
}
