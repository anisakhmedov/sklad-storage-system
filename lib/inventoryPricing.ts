/**
 * Позиции инвентаря, у которых в принципе нет цены — их нельзя продать (только списать), см.
 * lib/inventoryDisposal.ts::createInventoryDisposal и app/dashboard/inventory-disposals,
 * components/miniapp/InventoryDisposalsScreen.tsx. Сейчас это только «Ящики» — тара, которая
 * одалживается и должна вернуться, а не расходный товар с рыночной ценой (см. обсуждение с
 * владельцем: раньше был отдельный платный учёт ящиков, упразднён как путающий).
 *
 * Сравнение по имени (без учёта регистра/пробелов), а не по отдельному полю в InventoryItem —
 * позиции инвентаря заводятся произвольным текстом (см. components/dashboard/InventoryPanel.tsx::
 * SUGGESTIONS), выделенного типа "коробка" в схеме нет.
 */
const PRICELESS_ITEM_NAMES = new Set(["ящики", "ящик"]);

export function isPricelessItemName(name: string): boolean {
  return PRICELESS_ITEM_NAMES.has(name.trim().toLowerCase());
}
