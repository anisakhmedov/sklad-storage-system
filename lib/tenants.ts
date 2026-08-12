import ExcelJS from "exceljs";
import { connectDB } from "./db";
import { StorageRecord, GoodsOwnerType, IGoodsOwner } from "@/models/StorageRecord";
import { Income, IIncome } from "@/models/Income";
import { GoodsOwnerLink } from "@/models/GoodsOwnerLink";
// Побочный эффект: регистрирует схему "Container" до populate("containerId") ниже
// (см. пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import { Types } from "mongoose";
import { parseOwnerKey } from "./ownerKey";
import { getAllOwnerContainerDebts, OwnerContainerDebt } from "./debt";
import { UNIT_LABELS, PAYMENT_METHOD_LABELS } from "./labels";
import { formatTariffText } from "./tariff";

/**
 * Раздел «Арендаторы» на веб-панели (п.8 доработок) — полная аналитика по каждому клиенту,
 * доступная и как страница (getTenantDetail), и как выгрузка .xlsx (buildTenantWorkbook). В
 * отличие от Mini App («Клиенты», см. lib/reports.ts::getOwnerSummaryByKey), здесь доступ не
 * ограничен контейнерами сотрудника — веб-панель видит арендатора целиком, по всем контейнерам.
 */

export interface TenantListItem {
  ownerKey: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  phoneOrInn: string;
  containerCount: number;
  recordCount: number;
  totalAccrued: number;
  totalPaid: number;
  totalBalance: number;
  lastActivity: Date;
}

/** Сводный список арендаторов, агрегированный по всем связкам владелец+контейнер. */
export async function getAllTenants(): Promise<TenantListItem[]> {
  const debts = await getAllOwnerContainerDebts();

  const map = new Map<string, TenantListItem>();
  for (const d of debts) {
    const parsed = parseOwnerKey(d.ownerKey);
    const lastRecordDate = d.records.reduce(
      (max, r) => (r.since > max ? r.since : max),
      d.since
    );
    const existing = map.get(d.ownerKey);
    if (existing) {
      existing.containerCount += 1;
      existing.recordCount += d.records.length;
      existing.totalAccrued += d.accrued;
      existing.totalPaid += d.paid;
      existing.totalBalance += d.balance;
      if (lastRecordDate > existing.lastActivity) existing.lastActivity = lastRecordDate;
    } else {
      map.set(d.ownerKey, {
        ownerKey: d.ownerKey,
        ownerType: d.ownerType,
        ownerLabel: d.ownerLabel,
        phoneOrInn: parsed?.value || "—",
        containerCount: 1,
        recordCount: d.records.length,
        totalAccrued: d.accrued,
        totalPaid: d.paid,
        totalBalance: d.balance,
        lastActivity: lastRecordDate,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
}

type RecordWithContainer = {
  _id: Types.ObjectId;
  containerId: { _id: Types.ObjectId; name: string } | null;
  productName: string;
  quantity: number;
  unit: string;
  tariff: { type: string; rate: number };
  goodsOwner: IGoodsOwner;
  contractNumber?: string;
  createdAt: Date;
  createdByEmployeeId: { _id: Types.ObjectId; name: string; phone: string } | null;
  editedBy?: string;
  editedAt?: Date;
};

export interface TenantTelegramInfo {
  telegramId: string;
  linkedAt: Date;
}

export interface TenantDetail {
  ownerKey: string;
  ownerType: GoodsOwnerType;
  profile: IGoodsOwner;
  telegram: TenantTelegramInfo | null;
  records: RecordWithContainer[];
  incomes: (IIncome & { containerId: { _id: Types.ObjectId; name: string } | null })[];
  debts: OwnerContainerDebt[];
  totals: { accrued: number; paid: number; balance: number };
}

/** Полные карточки всех арендаторов — источник для «одного файла со всеми» (buildAllTenantsWorkbook). */
export async function getAllTenantDetails(): Promise<TenantDetail[]> {
  const tenants = await getAllTenants();
  const details = await Promise.all(tenants.map((t) => getTenantDetail(t.ownerKey)));
  return details.filter((d): d is TenantDetail => d !== null);
}

/** Полная карточка арендатора — источник и для онлайн-страницы, и для Excel-выгрузки. */
export async function getTenantDetail(ownerKey: string): Promise<TenantDetail | null> {
  const parsed = parseOwnerKey(ownerKey);
  if (!parsed) return null;
  await connectDB();

  const recordFilter =
    parsed.type === "individual"
      ? { "goodsOwner.type": "individual", "goodsOwner.phone": parsed.value }
      : { "goodsOwner.type": "company", "goodsOwner.inn": parsed.value };

  const [records, incomes, debts, telegramLink] = await Promise.all([
    StorageRecord.find(recordFilter)
      .sort({ createdAt: -1 })
      .populate("containerId", "name")
      .populate("createdByEmployeeId", "name phone")
      .lean() as unknown as Promise<RecordWithContainer[]>,
    Income.find({ ownerKey })
      .sort({ paidAt: -1 })
      .populate("containerId", "name")
      .lean() as unknown as Promise<(IIncome & { containerId: { _id: Types.ObjectId; name: string } | null })[]>,
    getAllOwnerContainerDebts({ ownerKey }),
    // Привязка к Telegram (см. models/GoodsOwnerLink.ts) есть только у физлиц.
    parsed.type === "individual" ? GoodsOwnerLink.findOne({ phone: parsed.value }).lean() : Promise.resolve(null),
  ]);

  if (records.length === 0) return null;

  const totals = debts.reduce(
    (acc, d) => ({ accrued: acc.accrued + d.accrued, paid: acc.paid + d.paid, balance: acc.balance + d.balance }),
    { accrued: 0, paid: 0, balance: 0 }
  );

  return {
    ownerKey,
    ownerType: parsed.type,
    profile: records[0].goodsOwner,
    telegram: telegramLink ? { telegramId: telegramLink.telegramId, linkedAt: telegramLink.linkedAt } : null,
    records,
    incomes,
    debts,
    totals,
  };
}

/** Сборка .xlsx со всеми данными арендатора — та же информация, что и на онлайн-странице. */
export async function buildTenantWorkbook(detail: TenantDetail): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sklad";
  wb.created = new Date();

  const profile = wb.addWorksheet("Профиль");
  profile.columns = [
    { header: "Поле", key: "field", width: 28 },
    { header: "Значение", key: "value", width: 50 },
  ];
  if (detail.profile.type === "individual") {
    profile.addRows([
      { field: "Тип", value: "Физическое лицо" },
      { field: "ФИО", value: detail.profile.fullName },
      { field: "Телефон", value: detail.profile.phone },
      { field: "Паспорт", value: detail.profile.passportData },
      { field: "Дата выдачи паспорта", value: detail.profile.passportIssueDate },
      { field: "Кем выдан", value: detail.profile.passportIssuedBy },
      { field: "ПИНФЛ", value: detail.profile.pinfl },
    ]);
  } else {
    profile.addRows([
      { field: "Тип", value: "Юридическое лицо" },
      { field: "Наименование", value: detail.profile.companyName },
      { field: "ИНН", value: detail.profile.inn },
      { field: "Директор", value: detail.profile.directorName },
    ]);
  }
  if (detail.telegram) {
    profile.addRows([
      { field: "Telegram ID", value: detail.telegram.telegramId },
      { field: "Привязан к боту с", value: new Date(detail.telegram.linkedAt).toLocaleString("ru-RU") },
    ]);
  }
  profile.addRows([
    { field: "Контейнеров", value: new Set(detail.records.map((r) => r.containerId?._id ? String(r.containerId._id) : "")).size },
    { field: "Записей", value: detail.records.length },
    { field: "Всего начислено", value: Math.round(detail.totals.accrued) },
    { field: "Всего оплачено", value: Math.round(detail.totals.paid) },
    { field: "Итоговая задолженность", value: Math.round(detail.totals.balance) },
  ]);
  profile.getRow(1).font = { bold: true };

  const recordsSheet = wb.addWorksheet("Записи");
  recordsSheet.columns = recordColumns();
  for (const r of detail.records) {
    recordsSheet.addRow(recordRow(r));
  }
  recordsSheet.getRow(1).font = { bold: true };

  const incomeSheet = wb.addWorksheet("Оплаты");
  incomeSheet.columns = incomeColumns();
  for (const inc of detail.incomes) {
    incomeSheet.addRow(incomeRow(inc));
  }
  incomeSheet.getRow(1).font = { bold: true };

  const debtSheet = wb.addWorksheet("Задолженность");
  debtSheet.columns = debtColumns();
  for (const d of detail.debts) {
    debtSheet.addRow(debtRow(d));
  }
  debtSheet.getRow(1).font = { bold: true };

  return wb.xlsx.writeBuffer();
}

const ownerLabelText = (owner: IGoodsOwner) => (owner.type === "individual" ? owner.fullName : owner.companyName);
const ownerContactText = (owner: IGoodsOwner) => (owner.type === "individual" ? owner.phone : `ИНН ${owner.inn}`);

function recordColumns(withOwner = false): Partial<ExcelJS.Column>[] {
  return [
    ...(withOwner ? [{ header: "Арендатор", key: "owner", width: 26 }] : []),
    { header: "Дата", key: "date", width: 18 },
    { header: "Контейнер", key: "container", width: 20 },
    { header: "Товар", key: "product", width: 26 },
    { header: "Количество", key: "quantity", width: 14 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Тариф", key: "tariff", width: 24 },
    { header: "№ договора", key: "contractNumber", width: 14 },
    { header: "Сотрудник", key: "employee", width: 20 },
    { header: "Изменено", key: "edited", width: 26 },
  ];
}

function recordRow(r: RecordWithContainer, ownerLabel?: string) {
  return {
    ...(ownerLabel !== undefined ? { owner: ownerLabel } : {}),
    date: new Date(r.createdAt).toLocaleString("ru-RU"),
    container: r.containerId?.name || "—",
    product: r.productName,
    quantity: r.quantity,
    unit: UNIT_LABELS[r.unit as keyof typeof UNIT_LABELS] || r.unit,
    tariff: formatTariffText(r.tariff as any),
    contractNumber: r.contractNumber || "—",
    employee: r.createdByEmployeeId?.name || "—",
    edited: r.editedAt ? `${r.editedBy || "?"} · ${new Date(r.editedAt).toLocaleString("ru-RU")}` : "—",
  };
}

function incomeColumns(withOwner = false): Partial<ExcelJS.Column>[] {
  return [
    ...(withOwner ? [{ header: "Арендатор", key: "owner", width: 26 }] : []),
    { header: "Дата оплаты", key: "date", width: 18 },
    { header: "Контейнер", key: "container", width: 20 },
    { header: "Сумма", key: "amount", width: 14 },
    { header: "Способ", key: "method", width: 14 },
    { header: "Примечание", key: "note", width: 26 },
    { header: "Кто зафиксировал", key: "recordedBy", width: 20 },
  ];
}

function incomeRow(inc: TenantDetail["incomes"][number], ownerLabel?: string) {
  return {
    ...(ownerLabel !== undefined ? { owner: ownerLabel } : {}),
    date: new Date(inc.paidAt).toLocaleString("ru-RU"),
    container: inc.containerId?.name || "—",
    amount: Math.round(inc.amount),
    method: PAYMENT_METHOD_LABELS[inc.method] || inc.method,
    note: inc.note || "",
    recordedBy: inc.recordedBy,
  };
}

function debtColumns(withOwner = false): Partial<ExcelJS.Column>[] {
  return [
    ...(withOwner ? [{ header: "Арендатор", key: "owner", width: 26 }] : []),
    { header: "Контейнер", key: "container", width: 20 },
    { header: "С даты", key: "since", width: 18 },
    { header: "Начислено", key: "accrued", width: 14 },
    { header: "Оплачено", key: "paid", width: 14 },
    { header: "Остаток", key: "balance", width: 14 },
  ];
}

function debtRow(d: OwnerContainerDebt, ownerLabel?: string) {
  return {
    ...(ownerLabel !== undefined ? { owner: ownerLabel } : {}),
    container: d.containerName,
    since: new Date(d.since).toLocaleDateString("ru-RU"),
    accrued: Math.round(d.accrued),
    paid: Math.round(d.paid),
    balance: Math.round(d.balance),
  };
}

/**
 * Один .xlsx со ВСЕМИ арендаторами разом (п.8 доработок — «экспортировать абсолютно всех
 * пользователей») — сводный лист + общие листы «Записи»/«Оплаты»/«Задолженность» с колонкой
 * «Арендатор» вместо отдельного набора листов на каждого (иначе при большом числе арендаторов
 * упёрлись бы в лимиты Excel на количество/уникальность имён листов).
 */
export async function buildAllTenantsWorkbook(details: TenantDetail[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sklad";
  wb.created = new Date();

  const summary = wb.addWorksheet("Арендаторы");
  summary.columns = [
    { header: "Арендатор", key: "owner", width: 28 },
    { header: "Тип", key: "type", width: 14 },
    { header: "Телефон / ИНН", key: "contact", width: 20 },
    { header: "Контейнеров", key: "containers", width: 14 },
    { header: "Записей", key: "records", width: 12 },
    { header: "Начислено", key: "accrued", width: 14 },
    { header: "Оплачено", key: "paid", width: 14 },
    { header: "Задолженность", key: "balance", width: 16 },
  ];
  for (const d of details) {
    summary.addRow({
      owner: ownerLabelText(d.profile),
      type: d.ownerType === "individual" ? "Физ. лицо" : "Юр. лицо",
      contact: ownerContactText(d.profile),
      containers: new Set(d.records.map((r) => (r.containerId?._id ? String(r.containerId._id) : ""))).size,
      records: d.records.length,
      accrued: Math.round(d.totals.accrued),
      paid: Math.round(d.totals.paid),
      balance: Math.round(d.totals.balance),
    });
  }
  summary.getRow(1).font = { bold: true };

  const recordsSheet = wb.addWorksheet("Записи");
  recordsSheet.columns = recordColumns(true);
  for (const d of details) {
    const ownerLabel = ownerLabelText(d.profile);
    for (const r of d.records) recordsSheet.addRow(recordRow(r, ownerLabel));
  }
  recordsSheet.getRow(1).font = { bold: true };

  const incomeSheet = wb.addWorksheet("Оплаты");
  incomeSheet.columns = incomeColumns(true);
  for (const d of details) {
    const ownerLabel = ownerLabelText(d.profile);
    for (const inc of d.incomes) incomeSheet.addRow(incomeRow(inc, ownerLabel));
  }
  incomeSheet.getRow(1).font = { bold: true };

  const debtSheet = wb.addWorksheet("Задолженность");
  debtSheet.columns = debtColumns(true);
  for (const d of details) {
    const ownerLabel = ownerLabelText(d.profile);
    for (const debt of d.debts) debtSheet.addRow(debtRow(debt, ownerLabel));
  }
  debtSheet.getRow(1).font = { bold: true };

  return wb.xlsx.writeBuffer();
}
