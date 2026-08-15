import { Schema, model, models, Model, Types } from "mongoose";
import { GoodsOwnerSchema, IGoodsOwner } from "./StorageRecord";

/**
 * Карточка клиента (арендатора) — ЕДИНСТВЕННЫЙ источник правды для его профиля и
 * ЕДИНСТВЕННЫЙ ключ агрегации договоров/оплат/долга (см. StorageRecord.clientId,
 * Income.clientId, InventoryLedgerEntry.clientId, Act.clientId, lib/debt.ts).
 *
 * ДО этой сущности личность арендатора вычислялась из телефона/ИНН (см. lib/ownerKey.ts) —
 * это ломалось на клиентах без своего телефона: сотрудник вписывал один и тот же "запасной"
 * номер разным людям, и система автоматически считала их ОДНИМ арендатором, складывая все
 * договора/оплаты/долги в одну карточку. Теперь личность — это _id этого документа; телефон/ИНН
 * остаются полезны для поиска/автодополнения (см. GET /api/miniapp/clients/search) и для
 * идентификации в Telegram-боте (см. lib/goodsOwnerBot.ts — там по определению доступен только
 * номер телефона), но НЕСКОЛЬКО клиентов МОГУТ законно иметь одинаковый телефон — индексы ниже
 * поэтому намеренно не unique.
 *
 * Один клиент создаётся либо явно ("Новый клиент" в мастере записи/поиск не дал совпадений),
 * либо переиспользуется по явному выбору сотрудника из поиска — см.
 * components/miniapp/NewRecordWizard.tsx, шаг "Владелец груза". Без явного выбора из поиска
 * дубликат никогда не создаётся молча, даже если телефон совпал с чьим-то ещё.
 */
export interface IClient {
  _id: Types.ObjectId;
  profile: IGoodsOwner;
  createdAt: Date;
  /** employee.name (Mini App) или identifier веб-пользователя, заведшего карточку. */
  createdBy: string;
}

const ClientSchema = new Schema<IClient>({
  profile: { type: GoodsOwnerSchema, required: true },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, required: true },
});

// Не unique — см. комментарий над IClient выше: разные клиенты могут законно иметь одинаковый
// телефон/ИНН. Индексы только ускоряют поиск (GET /api/miniapp/clients/search) и предупреждение
// о дубликате при вводе телефона, совпадающего с уже существующим клиентом.
ClientSchema.index({ "profile.type": 1, "profile.phone": 1 });
ClientSchema.index({ "profile.type": 1, "profile.inn": 1 });
ClientSchema.index({ "profile.fullName": 1 });
ClientSchema.index({ "profile.companyName": 1 });

export const Client: Model<IClient> = models.Client || model<IClient>("Client", ClientSchema);
