import { z } from "zod";
import { normalizePhone } from "./phone";
import { MAX_CELL_COUNT } from "./cells";

export const unitEnum = z.enum(["tonne", "kg", "box", "piece"]);
// Широкий enum ("terminal" включён) используется ТОЛЬКО как второй рубеж защиты в схемах
// моделей (models/Income.ts, models/GeneralIncome.ts, models/Expense.ts) — чтобы легаси-записи
// со старым способом "terminal" не ломались на full-document .save() (см. комментарий в
// models/Expense.ts). На входе (создание новых записей) везде используются более узкие enum'ы
// ниже — "terminal" нигде не принимается от клиента.
export const paymentMethodEnum = z.enum(["cash", "terminal", "transfer", "card"]);
// Расходы принимают только эти три способа (по решению владельца).
export const expensePaymentMethodEnum = z.enum(["cash", "transfer", "card"]);
// Оплаты (Income/GeneralIncome) — те же три способа, переименованы по просьбе владельца:
// "Наличные" / "Банковский счет (перевод)" / "Банковская карта (П2П)" (см. lib/labels.ts).
export const incomePaymentMethodEnum = z.enum(["cash", "transfer", "card"]);
export const webRoleEnum = z.enum(["owner", "trusted"]);
export const goodsOwnerTypeEnum = z.enum(["individual", "company"]);
export const tariffTypeEnum = z.enum(["per_day", "per_month", "per_kg_month", "per_kg_6_months"]);

export const loginSchema = z.object({
  identifier: z.string().min(3, "Слишком короткий идентификатор"),
  password: z.string().min(4, "Пароль должен быть не короче 4 символов"),
});

export const employeeRegisterSchema = z.object({
  name: z.string().min(2, "Укажите имя").max(100),
  phone: z.string().min(5, "Укажите номер телефона").max(30),
});

export const employeeStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

// Пустой массив = доступ ко всем контейнерам (см. models/Employee.ts). Оба поля необязательны
// и независимы: PATCH может менять только статус, только доступ, или оба сразу.
export const employeeUpdateSchema = z.object({
  status: z.enum(["approved", "rejected"]).optional(),
  containerAccess: z.array(z.string()).optional(),
});

export const containerCreateSchema = z.object({
  name: z.string().min(1, "Укажите номер/название контейнера").max(100),
  description: z.string().max(1000).optional().default(""),
  // Количество камер в контейнере — по умолчанию 8 (см. lib/cells.ts::DEFAULT_CELL_COUNT),
  // редактируется индивидуально на контейнер (см. models/Container.ts::cellCount).
  cellCount: z.coerce
    .number()
    .int()
    .min(1, "Должна быть хотя бы одна камера")
    .max(MAX_CELL_COUNT, "Слишком много камер")
    .optional(),
});

export const containerUpdateSchema = containerCreateSchema.partial();

// Ручная отметка занятости камеры хранения (см. models/Container.ts::fullCells,
// lib/containerCells.ts::toggleCellFull) — сотрудник сам решает, что в камеру больше
// физически ничего не влезет; это не автоматический подсчёт арендаторов. Верхняя граница —
// общий MAX_CELL_COUNT (второй рубеж защиты); реальный лимит для конкретного контейнера —
// его собственный cellCount, проверяется на уровне UI/бизнес-логики, а не здесь.
export const cellFullToggleSchema = z.object({
  cellNumber: z.coerce
    .number()
    .int()
    .min(1, "Некорректный номер камеры")
    .max(MAX_CELL_COUNT, "Некорректный номер камеры"),
  full: z.boolean(),
});

// Арендатор — физическое лицо: договор формируется именно из этих полей
// (см. lib/contract/generateContract.ts), поэтому они хранятся открытым текстом.
export const goodsOwnerIndividualSchema = z.object({
  type: z.literal("individual"),
  fullName: z.string().min(2, "Укажите ФИО владельца груза").max(200),
  phone: z
    .string()
    .min(5, "Укажите телефон владельца груза")
    .max(30)
    .transform((v) => normalizePhone(v)),
  passportData: z.string().min(3, "Укажите номер паспорта").max(100),
  pinfl: z.string().min(3, "Укажите ПИНФЛ").max(50),
  passportIssueDate: z.string().min(4, "Укажите дату выдачи паспорта").max(30),
  passportIssuedBy: z.string().min(2, "Укажите, кем выдан паспорт").max(300),
});

// Арендатор — юридическое лицо: договор не формируется, поля только сохраняются.
export const goodsOwnerCompanySchema = z.object({
  type: z.literal("company"),
  companyName: z.string().min(2, "Укажите наименование фирмы").max(300),
  inn: z.string().min(3, "Укажите ИНН").max(50),
  directorName: z.string().min(2, "Укажите имя и фамилию директора").max(200),
});

export const goodsOwnerSchema = z.discriminatedUnion("type", [
  goodsOwnerIndividualSchema,
  goodsOwnerCompanySchema,
]);

// Раньше здесь вводилась разовая "сумма оплаты" сразу при создании записи. Заменено на
// тариф (тип + ставка) — фактическая оплата теперь отдельная сущность (см. incomeCreateSchema
// ниже и README → «Тарифы, оплата и задолженность»), потому что арендатор платит не сразу.
export const tariffSchema = z.object({
  type: tariffTypeEnum,
  rate: z.coerce.number().min(0, "Ставка не может быть отрицательной"),
});

const storageRecordBaseSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  cellNumber: z.coerce.number().int().min(1, "Выберите камеру").max(MAX_CELL_COUNT, "Некорректный номер камеры"),
  productName: z.string().min(1, "Укажите наименование товара").max(300),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unit: unitEnum,
  goodsOwner: goodsOwnerSchema,
  tariff: tariffSchema,
  // PNG data URL подписи клиента, нарисованной на экране сотрудника в Mini App (см.
  // components/miniapp/SignaturePad.tsx). Обязательна для физлиц — см. superRefine ниже
  // в storageRecordCreateSchema; для юрлиц не требуется (договор не формируется).
  clientSignaturePng: z.string().optional(),
  // От чьего имени (какой фирмы владельца) составляется договор/акт — см. models/Firm.ts.
  // Необязательно: если фирм ещё не заведено или сотрудник ничего не выбрал, документ
  // использует lib/contract/firmDefaults.ts::DEFAULT_FIRM (см. app/api/miniapp/records/route.ts).
  firmId: z.string().optional(),
  // Планируемая дата, когда клиент заберёт товар — подсказывается по тарифу (см.
  // lib/tariff.ts::suggestedEndDate), но необязательна и редактируема (см.
  // models/StorageRecord.ts::expectedEndDate). Не влияет на начисление.
  expectedEndDate: z.coerce.date().optional(),
});

// "За кг" тарифы требуют известного веса — доступны только для unit "kg"/"tonne".
// Проверка на уровне создания (все поля точно присутствуют вместе); при частичном
// обновлении (PATCH) эта же проверка дублируется на уровне Mongoose-модели поверх
// уже смёрженного документа, см. models/StorageRecord.ts.
export const storageRecordCreateSchema = storageRecordBaseSchema.superRefine((data, ctx) => {
  const needsWeight = data.tariff.type === "per_kg_month" || data.tariff.type === "per_kg_6_months";
  if (needsWeight && data.unit !== "kg" && data.unit !== "tonne") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tariff", "type"],
      message: 'Тариф "за кг" применим только к записям с единицей измерения "kg" или "tonne"',
    });
  }
  // Договор формируется только для физлиц (см. lib/contract/generateContract.ts) — для них
  // клиент обязан расписаться на экране сотрудника перед сохранением записи (см. шаг
  // "Подпись" в components/miniapp/NewRecordWizard.tsx). Юрлицам подпись не нужна.
  if (data.goodsOwner.type === "individual" && !data.clientSignaturePng) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["clientSignaturePng"],
      message: "Клиент должен подписать договор",
    });
  }
});

// createdAt отдельно от storageRecordBaseSchema: это дата договора, а не поле, вводимое при
// создании записи (при создании она всегда "сейчас") — редактируется только владельцем/доверенным
// лицом на веб-панели (см. app/dashboard/records/page.tsx), и напрямую влияет на дату начала
// начисления по тарифу (accrueTariff берёт `from: record.createdAt`, см. lib/tariff.ts).
export const storageRecordUpdateSchema = storageRecordBaseSchema.partial().extend({
  createdAt: z.coerce.date().optional(),
});

// Закрытие/переоткрытие записи ("товар забран", см. models/StorageRecord.ts::closedAt) —
// отдельная узкая операция, а не часть общего PATCH выше, т.к. меняет только два поля и не
// должна требовать пересылки всей записи. closedAt: null явно переоткрывает запись (возврат
// в "активные"); отсутствие поля недопустимо — действие должно быть явным.
export const storageRecordCloseSchema = z.object({
  closedAt: z.union([z.coerce.date(), z.null()]),
});

// Продажа/списание инвентаря (см. models/InventoryDisposalEntry.ts) — заменяет собой прежний
// раздел "Контейнеры для перевозки" (убран полностью по решению владельца). "sale" уменьшает
// свободный остаток позиции и требует сумму выручки; "writeoff" тоже уменьшает остаток, но без
// денег (порча/утеря и т.п.).
const inventoryDisposalBaseSchema = z.object({
  itemId: z.string().min(1, "Выберите позицию инвентаря"),
  containerId: z.string().min(1, "Выберите контейнер"),
  kind: z.enum(["sale", "writeoff"]),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  amount: z.coerce.number().min(0, "Сумма не может быть отрицательной").optional(),
  method: incomePaymentMethodEnum.optional(),
  note: z.string().max(500).optional().default(""),
});

function requireAmountOnSale(data: { kind: string; amount?: number }, ctx: z.RefinementCtx) {
  if (data.kind === "sale" && !(data.amount && data.amount > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["amount"], message: "Укажите сумму продажи" });
  }
}

export const inventoryDisposalCreateSchema = inventoryDisposalBaseSchema.superRefine(requireAmountOnSale);

// Собственная фирма владельца склада ("Сақловчи" в договоре/акте) — см. models/Firm.ts,
// lib/contract/firmDefaults.ts::FirmSnapshot.
export const firmCreateSchema = z.object({
  name: z.string().min(1, "Укажите название фирмы").max(300),
  directorFullName: z.string().min(1, "Укажите ФИО директора (как в договоре)").max(200),
  directorShortName: z.string().min(1, "Укажите сокращённое имя директора (для подписи)").max(100),
  address: z.string().min(1, "Укажите адрес").max(300),
  bankBranch: z.string().min(1, "Укажите банк/отделение").max(300),
  bankAccount: z.string().min(1, "Укажите расчётный счёт").max(50),
  inn: z.string().min(1, "Укажите ИНН").max(50),
  bankCode: z.string().min(1, "Укажите банковский код (МФО)").max(20),
});
export const firmUpdateSchema = firmCreateSchema.partial();

export const webAccessCreateSchema = z.object({
  identifier: z.string().min(3, "Укажите username или телефон"),
  role: webRoleEnum,
});

// Добавление/убавление количества груза у уже существующей записи (Mini App, см.
// app/api/miniapp/records/[id]/adjust/route.ts) — delta > 0 добавляет, delta < 0 убавляет.
export const quantityAdjustSchema = z.object({
  delta: z.coerce.number().refine((v) => v !== 0, "Изменение количества не может быть нулевым"),
  note: z.string().max(500).optional().default(""),
});

// Расход (снятие владельцем/зарплата/прочее, см. models/Expense.ts). status выставляется
// сервером в зависимости от того, кто создаёт (owner → approved сразу, employee → pending) —
// не принимается от клиента.
export const expenseCreateSchema = z.object({
  type: z.enum(["owner_withdrawal", "salary", "other"]),
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: expensePaymentMethodEnum,
  note: z.string().max(500).optional().default(""),
  employeeName: z.string().max(200).optional(),
});

export const expenseStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

// Полное редактирование уже созданного расхода (веб-панель) — в отличие от expenseStatusSchema
// выше (только подтверждение/отклонение заявки владельцем), это правка самих полей расхода,
// доступна независимо от текущего способа оплаты и статуса (см. app/api/expenses/[id]/route.ts).
export const expenseUpdateSchema = z.object({
  type: z.enum(["owner_withdrawal", "salary", "other"]).optional(),
  amount: z.coerce.number().positive("Сумма должна быть больше 0").optional(),
  method: expensePaymentMethodEnum.optional(),
  note: z.string().max(500).optional(),
  employeeName: z.string().max(200).optional(),
});

// «Приход на холодильник» — общий приход не по конкретному клиенту (см. models/GeneralIncome.ts).
export const generalIncomeCreateSchema = z.object({
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: incomePaymentMethodEnum,
  note: z.string().max(500).optional().default(""),
  paidAt: z.coerce.date().optional(),
});

// Складской инвентарь (см. models/InventoryItem.ts) — только владелец. У каждого контейнера
// (холодильника) свой инвентарь — containerId обязателен для НОВЫХ позиций (у старых, заведённых
// до этой доработки, поле может отсутствовать — привязывается вручную через PATCH, см.
// inventoryItemUpdateSchema ниже и app/dashboard/inventory/page.tsx).
export const inventoryItemCreateSchema = z.object({
  name: z.string().min(1, "Укажите название").max(200),
  quantity: z.coerce.number().min(0, "Количество не может быть отрицательным").default(0),
  unit: z.string().max(20).optional().default("шт."),
  containerId: z.string().min(1, "Выберите контейнер"),
  note: z.string().max(500).optional().default(""),
});

export const inventoryItemUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.coerce.number().min(0, "Количество не может быть отрицательным").optional(),
  unit: z.string().max(20).optional(),
  // Используется и для обычного редактирования, и для ручной привязки старых позиций к
  // контейнеру (миграция — см. models/InventoryItem.ts).
  containerId: z.string().min(1, "Выберите контейнер").optional(),
  note: z.string().max(500).optional(),
});

// Выдать/принять инвентарь клиенту (см. models/InventoryLedgerEntry.ts, lib/inventoryLedger.ts) —
// без ставки/стоимости (в отличие от прежнего параллельного учёта ящиков, упразднённого).
export const inventoryLedgerEntryCreateSchema = z.object({
  itemId: z.string().min(1, "Выберите позицию инвентаря"),
  ownerKey: z.string().min(1, "Не выбран владелец груза"),
  ownerType: goodsOwnerTypeEnum,
  ownerLabel: z.string().min(1, "Не указано имя/наименование владельца").max(300),
  containerId: z.string().min(1, "Выберите контейнер"),
  cellNumber: z.coerce.number().int().min(1).max(MAX_CELL_COUNT).optional(),
  direction: z.enum(["given", "returned"]),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
});

// Обход холодильной камеры — температура и сила тока (ампер) для каждой камеры контейнера
// отдельно (см. models/PatrolLog.ts, lib/patrols.ts).
export const patrolLogCreateSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  cellNumber: z.coerce.number().int().min(1, "Некорректный номер камеры").max(MAX_CELL_COUNT, "Некорректный номер камеры"),
  period: z.enum(["morning", "evening"]),
  temperature: z.coerce.number().min(-100).max(100, "Некорректная температура"),
  amperage: z.coerce.number().min(0, "Некорректное значение ампер").max(1000, "Некорректное значение ампер"),
});

export const withdrawalCreateSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  productName: z.string().min(1, "Укажите наименование товара").max(300),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unit: unitEnum,
  note: z.string().max(500).optional().default(""),
});

// Запись фактической оплаты (см. models/Income.ts). ownerKey/ownerLabel/ownerType приходят
// с клиента из того же списка, что и таблица задолженности (GET /api/debts) — так выбор
// "человек → его контейнер" в форме однозначно соответствует существующей связке
// владелец+контейнер, найденной по реальным StorageRecord (сервер дополнительно проверяет
// это в app/api/income/route.ts, чтобы нельзя было создать доход на несуществующую связку).
export const incomeCreateSchema = z.object({
  ownerType: goodsOwnerTypeEnum,
  ownerKey: z.string().min(1, "Не выбран владелец груза"),
  ownerLabel: z.string().min(1, "Не указано имя/наименование владельца").max(300),
  containerId: z.string().min(1, "Выберите контейнер"),
  // Необязательно — платёж может быть "за контейнер в целом" (см. models/Income.ts).
  cellNumber: z.coerce.number().int().min(1).max(MAX_CELL_COUNT).optional(),
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: incomePaymentMethodEnum,
  paidAt: z.coerce.date().optional(),
  note: z.string().max(500).optional().default(""),
});

// Полное редактирование уже внесённого платежа (веб-панель) — раньше редактирования не было
// вовсе, доступно независимо от способа оплаты. ownerKey/ownerType сознательно НЕ включены —
// это идентификатор арендатора (см. lib/ownerKey.ts), его смена ломала бы привязку к
// задолженности; исправить имя владельца можно через ownerLabel (просто отображаемая подпись)
// или через редактирование карточки арендатора (см. app/api/tenants/[ownerKey]/route.ts).
export const incomeUpdateSchema = z.object({
  ownerLabel: z.string().min(1, "Не указано имя/наименование владельца").max(300).optional(),
  containerId: z.string().min(1, "Выберите контейнер").optional(),
  // null — явно очистить камеру (платёж "за контейнер в целом"); undefined — не менять.
  cellNumber: z.union([z.coerce.number().int().min(1).max(MAX_CELL_COUNT), z.null()]).optional(),
  amount: z.coerce.number().positive("Сумма должна быть больше 0").optional(),
  method: incomePaymentMethodEnum.optional(),
  paidAt: z.coerce.date().optional(),
  note: z.string().max(500).optional(),
});

// Банковский счёт (перевод) поступает сразу на счёт владельца, минуя сотрудника на складе, —
// сотрудник физически не может подтвердить такой платёж, поэтому в Mini App
// (app/api/miniapp/income/route.ts, components/miniapp/AddIncomeWizard.tsx) доступны только
// способы, которые сотрудник принимает лично: наличные и карта (П2П). Банковский перевод
// по-прежнему вносит сам владелец на веб-панели (app/api/income/route.ts, incomeCreateSchema
// без сужения).
export const employeePaymentMethodEnum = z.enum(["cash", "card"]);
export const incomeCreateSchemaEmployee = incomeCreateSchema.extend({ method: employeePaymentMethodEnum });

// Тот же принцип для продажи инвентаря (см. inventoryDisposalCreateSchema выше) — сотрудник в
// Mini App может принять только наличные/карту, не перевод.
export const inventoryDisposalCreateSchemaEmployee = inventoryDisposalBaseSchema
  .extend({ method: employeePaymentMethodEnum.optional() })
  .superRefine(requireAmountOnSale);

export type LoginInput = z.infer<typeof loginSchema>;
export type EmployeeRegisterInput = z.infer<typeof employeeRegisterSchema>;
export type ContainerCreateInput = z.infer<typeof containerCreateSchema>;
export type GoodsOwnerInput = z.infer<typeof goodsOwnerSchema>;
export type StorageRecordCreateInput = z.infer<typeof storageRecordCreateSchema>;
export type WebAccessCreateInput = z.infer<typeof webAccessCreateSchema>;
export type WithdrawalCreateInput = z.infer<typeof withdrawalCreateSchema>;
export type IncomeCreateInput = z.infer<typeof incomeCreateSchema>;
