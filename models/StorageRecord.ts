import { Schema, model, models, Model, Types } from "mongoose";
import { MAX_CELL_COUNT } from "@/lib/cells";

export type Unit = "tonne" | "kg" | "box" | "piece";
// "cash" — единственный способ, учитываемый в кассе (см. lib/finance.ts::KASSA_METHODS);
// "terminal"/"transfer"/"card" видны в общих отчётах и списке платежей, но не в кассе.
export type PaymentMethod = "cash" | "terminal" | "transfer" | "card";
export type GoodsOwnerType = "individual" | "company";

/**
 * Арендатор — физическое лицо. Паспортные данные и ПИНФЛ хранятся ОТКРЫТЫМ текстом
 * (намеренно, начиная с части 3 ТЗ): они подставляются напрямую в текст договора
 * (см. lib/contract/generateContract.ts), поэтому шифрование на уровне поля здесь
 * не применяется. Раньше это место было помечено TODO(prod) на шифрование — решение
 * отменено, см. README → «Безопасность».
 */
export interface IGoodsOwnerIndividual {
  type: "individual";
  fullName: string;
  phone: string;
  passportData: string;
  pinfl: string;
  /** Строка в свободном формате даты (напр. "12.05.2020") — как в паспорте/документе. */
  passportIssueDate: string;
  passportIssuedBy: string;
}

/** Арендатор — юридическое лицо. Договор для юрлиц не формируется (см. README). */
export interface IGoodsOwnerCompany {
  type: "company";
  companyName: string;
  inn: string;
  directorName: string;
}

export type IGoodsOwner = IGoodsOwnerIndividual | IGoodsOwnerCompany;

export type TariffType = "per_day" | "per_month" | "per_kg_month" | "per_kg_6_months";

/**
 * Договорённые условия оплаты за хранение этой конкретной записи — НЕ факт оплаты.
 * Арендатор платит не сразу и не обязательно всей суммой, поэтому фактические поступления
 * денег фиксируются отдельно (models/Income.ts), а задолженность считается начислением по
 * тарифу с даты создания записи (см. lib/tariff.ts, lib/debt.ts, README).
 */
export interface ITariff {
  type: TariffType;
  rate: number;
}

export interface IStorageRecord {
  _id: Types.ObjectId;
  containerId: Types.ObjectId;
  /** Номер камеры хранения внутри контейнера (1–8, см. lib/cells.ts::CELL_COUNT) —
   * в какую именно камеру сотрудник поставил товар клиента. Несколько клиентов могут
   * делить одну камеру (см. lib/containerCells.ts::getCellsGrid). */
  cellNumber: number;
  productName: string;
  quantity: number;
  unit: Unit;
  goodsOwner: IGoodsOwner;
  tariff: ITariff;
  createdByEmployeeId: Types.ObjectId;
  createdAt: Date;
  editedBy?: string;
  editedAt?: Date;
  /**
   * PNG-подпись клиента (физлицо), сделанная им лично на экране сотрудника при оформлении
   * договора в Mini App (см. components/miniapp/SignaturePad.tsx, шаг "Подпись" в
   * components/miniapp/NewRecordWizard.tsx). Печатается в PDF на месте строки
   * "КЛИЕНТ ____________________" вместо пустой линии (см.
   * lib/contract/generateContract.ts::renderSignatureBlock) — во ВСЕХ путях перегенерации
   * PDF (веб, /contract в чате, авто-отправка сотруднику), т.к. это часть данных записи.
   * Только для физлиц — юрлицам договор не формируется.
   */
  clientSignaturePng?: Buffer;
  signedAt?: Date;
  /**
   * Номер договора вида "3-2026" — присваивается один раз при создании записи для физлица
   * (см. lib/counter.ts, app/api/miniapp/records/route.ts) и больше не меняется, даже если
   * запись позже отредактирована. У записей, созданных до этой доработки, поле отсутствует —
   * им номер присваивается лениво при первой генерации PDF (см. lib/contract/contractService.ts).
   */
  contractNumber?: string;
  /**
   * Снимок реквизитов фирмы-подписанта ("Сақловчи") на момент создания записи — см.
   * lib/contract/firmDefaults.ts::FirmSnapshot (та же форма), models/Firm.ts. Снимок, а не
   * ссылка на Firm — чтобы более позднее редактирование/удаление фирмы не меняло задним
   * числом уже выданные PDF. Отсутствует у записей, созданных до этой доработки (и когда
   * сотрудник ничего не выбрал, если фирма ещё не заведена) — тогда PDF использует
   * DEFAULT_FIRM (те же значения, что раньше были захардкожены в шаблоне).
   */
  issuingFirm?: {
    name: string;
    directorFullName: string;
    directorShortName: string;
    address: string;
    bankBranch: string;
    bankAccount: string;
    inn: string;
    bankCode: string;
  };
}

// Единая гибкая Mongoose-схема на оба варианта goodsOwner (Mongoose не умеет нативно
// дискриминировать вложенный — не top-level — поддокумент по значению). Обязательность
// полей по типу проверяется в pre("validate") ниже; основную проверку формы делает zod
// на уровне API (lib/validation.ts, storageRecordCreateSchema) — как и везде в проекте,
// API не доверяет клиенту, а модель — второй рубеж защиты.
const GoodsOwnerSchema = new Schema<IGoodsOwner>(
  {
    type: { type: String, enum: ["individual", "company"], required: true },
    // — физическое лицо —
    fullName: { type: String, trim: true },
    phone: { type: String, trim: true },
    passportData: { type: String, trim: true },
    pinfl: { type: String, trim: true },
    passportIssueDate: { type: String, trim: true },
    passportIssuedBy: { type: String, trim: true },
    // — юридическое лицо —
    companyName: { type: String, trim: true },
    inn: { type: String, trim: true },
    directorName: { type: String, trim: true },
  },
  { _id: false }
);

GoodsOwnerSchema.pre("validate", function (next) {
  const owner = this as unknown as IGoodsOwner;
  if (owner.type === "individual") {
    const o = owner as IGoodsOwnerIndividual;
    if (!o.fullName || !o.phone || !o.passportData || !o.pinfl || !o.passportIssueDate || !o.passportIssuedBy) {
      return next(
        new Error(
          "Для физического лица обязательны: ФИО, телефон, номер паспорта, ПИНФЛ, дата выдачи, кем выдан"
        )
      );
    }
  } else if (owner.type === "company") {
    const o = owner as IGoodsOwnerCompany;
    if (!o.companyName || !o.inn || !o.directorName) {
      return next(new Error("Для юридического лица обязательны: наименование фирмы, ИНН, ФИО директора"));
    }
  } else {
    return next(new Error("Не указан тип арендатора (type: individual | company)"));
  }
  next();
});

const TariffSchema = new Schema<ITariff>(
  {
    type: {
      type: String,
      enum: ["per_day", "per_month", "per_kg_month", "per_kg_6_months"],
      required: true,
    },
    rate: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const StorageRecordSchema = new Schema<IStorageRecord>({
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  // Верхняя граница — общий MAX_CELL_COUNT (второй рубеж защиты); реальный лимит для
  // конкретного контейнера — его собственный cellCount (см. models/Container.ts).
  cellNumber: { type: Number, required: true, min: 1, max: MAX_CELL_COUNT },
  productName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, enum: ["tonne", "kg", "box", "piece"], required: true },
  goodsOwner: { type: GoodsOwnerSchema, required: true },
  tariff: { type: TariffSchema, required: true },
  createdByEmployeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  editedBy: { type: String },
  editedAt: { type: Date },
  contractNumber: { type: String },
  clientSignaturePng: { type: Buffer },
  signedAt: { type: Date },
  issuingFirm: {
    type: new Schema(
      {
        name: { type: String, required: true },
        directorFullName: { type: String, required: true },
        directorShortName: { type: String, required: true },
        address: { type: String, required: true },
        bankBranch: { type: String, required: true },
        bankAccount: { type: String, required: true },
        inn: { type: String, required: true },
        bankCode: { type: String, required: true },
      },
      { _id: false }
    ),
    required: false,
  },
});

// Договор формируется только для физлиц — индекс ускоряет поиск по телефону
// (уведомления, сводка и запрос договора владельцем груза, см. lib/telegramBot.ts).
StorageRecordSchema.index({ "goodsOwner.type": 1, "goodsOwner.phone": 1 });

// Ускоряет построение сетки камер по контейнеру (см. lib/containerCells.ts::getCellsGrid).
StorageRecordSchema.index({ containerId: 1, cellNumber: 1 });

// Тариф "за кг" считается от веса в килограммах (см. lib/tariff.ts) — недоступен для
// единиц "box"/"piece", у которых вес неизвестен. Дублирует проверку из lib/validation.ts
// как второй рубеж защиты (см. комментарий у GoodsOwnerSchema.pre("validate") выше).
StorageRecordSchema.pre("validate", function (next) {
  const needsWeight = this.tariff?.type === "per_kg_month" || this.tariff?.type === "per_kg_6_months";
  if (needsWeight && this.unit !== "kg" && this.unit !== "tonne") {
    return next(
      new Error('Тариф "за кг" применим только к записям с единицей измерения "kg" или "tonne"')
    );
  }
  next();
});

export const StorageRecord: Model<IStorageRecord> =
  models.StorageRecord || model<IStorageRecord>("StorageRecord", StorageRecordSchema);
