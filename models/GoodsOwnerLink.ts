import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Связка "владелец груза (арендатор) ↔ его Telegram-аккаунт".
 *
 * Владельцы груза — не сотрудники, у них нет доступа к Mini App. Они пишут тому же боту
 * напрямую, идентифицируются по номеру телефона (см. lib/phone.ts) через кнопку Telegram
 * "Отправить номер телефона" (см. lib/telegramBot.ts). После идентификации бот может:
 *  - прислать уведомление о новой записи StorageRecord с их номером телефона;
 *  - прислать сводку по их товарам (по ключевым словам/`/report`);
 *  - прислать PDF договора (по ключевым словам/`/contract`), только для физлиц.
 *
 * Один telegramId — одна активная привязка (upsert при каждом успешном подтверждении
 * номера). phone хранится в нормализованном виде (см. lib/phone.ts), чтобы совпадать
 * с StorageRecord.goodsOwner.phone независимо от формата ввода.
 */
export interface IGoodsOwnerLink {
  _id: Types.ObjectId;
  telegramId: string;
  phone: string;
  fullName: string;
  linkedAt: Date;
}

const GoodsOwnerLinkSchema = new Schema<IGoodsOwnerLink>({
  telegramId: { type: String, required: true, unique: true, index: true },
  phone: { type: String, required: true, index: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  linkedAt: { type: Date, default: Date.now },
});

export const GoodsOwnerLink: Model<IGoodsOwnerLink> =
  models.GoodsOwnerLink || model<IGoodsOwnerLink>("GoodsOwnerLink", GoodsOwnerLinkSchema);
