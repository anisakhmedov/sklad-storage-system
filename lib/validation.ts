import { z } from "zod";
import { normalizePhone } from "./phone";

export const unitEnum = z.enum(["tonne", "kg", "box", "piece"]);
export const paymentMethodEnum = z.enum(["cash", "terminal", "transfer", "card"]);
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
});

export const containerUpdateSchema = containerCreateSchema.partial();

// Ручная отметка занятости камеры хранения (см. models/Container.ts::fullCells,
// lib/containerCells.ts::toggleCellFull) — сотрудник сам решает, что в камеру больше
// физически ничего не влезет; это не автоматический подсчёт арендаторов.
export const cellFullToggleSchema = z.object({
  cellNumber: z.coerce.number().int().min(1, "Некорректный номер камеры").max(8, "Некорректный номер камеры"),
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
  cellNumber: z.coerce.number().int().min(1, "Выберите камеру").max(8, "Некорректный номер камеры"),
  productName: z.string().min(1, "Укажите наименование товара").max(300),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unit: unitEnum,
  goodsOwner: goodsOwnerSchema,
  tariff: tariffSchema,
  // PNG data URL подписи клиента, нарисованной на экране сотрудника в Mini App (см.
  // components/miniapp/SignaturePad.tsx). Обязательна для физлиц — см. superRefine ниже
  // в storageRecordCreateSchema; для юрлиц не требуется (договор не формируется).
  clientSignaturePng: z.string().optional(),
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

// Учёт ящиков, выданных/возвращённых клиентом (см. models/BoxLedgerEntry.ts, lib/boxes.ts).
export const boxEntryCreateSchema = z.object({
  ownerKey: z.string().min(1, "Не выбран владелец груза"),
  ownerType: goodsOwnerTypeEnum,
  ownerLabel: z.string().min(1, "Не указано имя/наименование владельца").max(300),
  containerId: z.string().min(1, "Выберите контейнер"),
  direction: z.enum(["given", "returned"]),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  ratePerBox: z.coerce.number().min(0, "Ставка не может быть отрицательной"),
});

// Расход (снятие владельцем/зарплата/прочее, см. models/Expense.ts). status выставляется
// сервером в зависимости от того, кто создаёт (owner → approved сразу, employee → pending) —
// не принимается от клиента.
export const expenseCreateSchema = z.object({
  type: z.enum(["owner_withdrawal", "salary", "other"]),
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: paymentMethodEnum,
  note: z.string().max(500).optional().default(""),
  employeeName: z.string().max(200).optional(),
});

export const expenseStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

// «Приход на холодильник» — общий приход не по конкретному клиенту (см. models/GeneralIncome.ts).
export const generalIncomeCreateSchema = z.object({
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: paymentMethodEnum,
  note: z.string().max(500).optional().default(""),
  paidAt: z.coerce.date().optional(),
});

// Складской инвентарь (см. models/InventoryItem.ts) — только владелец.
export const inventoryItemCreateSchema = z.object({
  name: z.string().min(1, "Укажите название").max(200),
  quantity: z.coerce.number().min(0, "Количество не может быть отрицательным").default(0),
  unit: z.string().max(20).optional().default("шт."),
  note: z.string().max(500).optional().default(""),
});

export const inventoryItemUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.coerce.number().min(0, "Количество не может быть отрицательным").optional(),
  unit: z.string().max(20).optional(),
  note: z.string().max(500).optional(),
});

// Обход холодильной камеры — только температура (см. models/PatrolLog.ts, lib/patrols.ts).
export const patrolLogCreateSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  period: z.enum(["morning", "evening"]),
  temperature: z.coerce.number().min(-100).max(100, "Некорректная температура"),
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
  amount: z.coerce.number().positive("Сумма должна быть больше 0"),
  method: paymentMethodEnum,
  paidAt: z.coerce.date().optional(),
  note: z.string().max(500).optional().default(""),
});

// Перечисление (банковский перевод) поступает сразу на счёт владельца, минуя сотрудника на
// складе, — сотрудник физически не может подтвердить такой платёж, поэтому в Mini App
// (app/api/miniapp/income/route.ts, components/miniapp/AddIncomeWizard.tsx) доступны только
// способы, которые сотрудник принимает лично: наличные, терминал, карта. Перечисление
// по-прежнему вносит сам владелец на веб-панели (app/api/income/route.ts, incomeCreateSchema
// без сужения).
export const employeePaymentMethodEnum = z.enum(["cash", "terminal", "card"]);
export const incomeCreateSchemaEmployee = incomeCreateSchema.extend({ method: employeePaymentMethodEnum });

export type LoginInput = z.infer<typeof loginSchema>;
export type EmployeeRegisterInput = z.infer<typeof employeeRegisterSchema>;
export type ContainerCreateInput = z.infer<typeof containerCreateSchema>;
export type GoodsOwnerInput = z.infer<typeof goodsOwnerSchema>;
export type StorageRecordCreateInput = z.infer<typeof storageRecordCreateSchema>;
export type WebAccessCreateInput = z.infer<typeof webAccessCreateSchema>;
export type WithdrawalCreateInput = z.infer<typeof withdrawalCreateSchema>;
export type IncomeCreateInput = z.infer<typeof incomeCreateSchema>;
