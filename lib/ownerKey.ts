import { IGoodsOwner, GoodsOwnerType } from "@/models/StorageRecord";

/**
 * Устойчивый идентификатор арендатора для агрегации задолженности/платежей поверх
 * нескольких StorageRecord (см. lib/debt.ts). Для физлиц — нормализованный телефон
 * (goodsOwner.phone уже нормализован на входе, см. lib/validation.ts), для юрлиц — ИНН
 * (у юрлиц нет телефона в схеме). Формат `${type}:${значение}`, чтобы совпадающие по
 * значению номер и ИНН никогда не схлопнулись в один ключ.
 */
export function ownerKeyOf(owner: Pick<IGoodsOwner, "type"> & Record<string, unknown>): string {
  if (owner.type === "individual") return `individual:${(owner as any).phone}`;
  return `company:${String((owner as any).inn).trim()}`;
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
