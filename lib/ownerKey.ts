import type { IGoodsOwner, GoodsOwnerType } from "@/models/StorageRecord";

/**
 * Телефон/ИНН-ключ владельца груза — ФОРМАТ `${type}:${значение}`, чтобы совпадающие по
 * значению номер и ИНН никогда не схлопнулись в один ключ.
 *
 * ВАЖНО: с появлением models/Client.ts это БОЛЬШЕ НЕ идентификатор арендатора для агрегации —
 * этой ролью теперь обладает исключительно `clientId` (см. lib/debt.ts, lib/tenants.ts).
 * Раньше (до Client) эта строка сама была ключом агрегации — это ломалось, когда двум разным
 * людям без своего телефона вписывали один и тот же "запасной" номер: они автоматически
 * считались одним арендатором. Сейчас функции здесь используются только там, где это уместно:
 * денормализованное поле для отображения (Income.ownerKey и т.п.), поиск/предупреждение о
 * дубликате телефона при заведении нового клиента (см. GET /api/miniapp/clients/search) и
 * идентификация в Telegram-боте, которому в принципе доступен только номер телефона (см.
 * lib/goodsOwnerBot.ts) — там несколько клиентов с одним телефоном принципиально неразличимы.
 *
 * Сигнатура намеренно упрощена (не Pick<IGoodsOwner,...>): некоторые клиентские компоненты
 * (напр. app/dashboard/records/page.tsx) держат собственную локальную копию типа goodsOwner
 * без индексной сигнатуры — структурно она достаточна, а Record<string, unknown> в типе
 * параметра такие объекты отклоняет.
 */
export function ownerKeyOf(
  owner: { type: "individual"; phone?: string } | { type: "company"; inn?: string }
): string {
  // Толерантно к неполным/легаси-данным (напр. запись без телефона) — лучше вернуть
  // нерабочую, но безопасную ссылку, чем уронить рендер всей таблицы записей (см.
  // app/dashboard/records/page.tsx) на одной битой строке.
  if (owner.type === "individual") return `individual:${owner.phone || ""}`;
  return `company:${(owner.inn || "").trim()}`;
}

export function ownerKeyForPhone(phone: string): string {
  return `individual:${phone}`;
}

export function ownerKeyForInn(inn: string): string {
  return `company:${inn.trim()}`;
}

export function ownerLabelOf(owner: IGoodsOwner): string {
  return owner.type === "individual" ? owner.fullName : owner.companyName;
}

export function parseOwnerKey(key: string): { type: GoodsOwnerType; value: string } | null {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const type = key.slice(0, idx);
  const value = key.slice(idx + 1);
  if (type !== "individual" && type !== "company") return null;
  return { type, value };
}

/** Денормализованная тройка полей (ownerKey/ownerLabel/ownerType), которую хранят Income/
 * InventoryLedgerEntry/Act ТОЛЬКО для отображения без join — вычисляется из карточки клиента
 * (models/Client.ts) на сервере, никогда не принимается от клиента напрямую (см. models/Client.ts,
 * lib/validation.ts::incomeCreateSchema/inventoryLedgerEntryCreateSchema). */
export function denormalizeOwner(profile: IGoodsOwner): { ownerKey: string; ownerLabel: string; ownerType: GoodsOwnerType } {
  return { ownerKey: ownerKeyOf(profile), ownerLabel: ownerLabelOf(profile), ownerType: profile.type };
}
