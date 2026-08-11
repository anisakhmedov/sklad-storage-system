import ExcelJS from "exceljs";
import { connectDB } from "./db";
import { StorageRecord, GoodsOwnerType, IGoodsOwner } from "@/models/StorageRecord";
import { Income, IIncome } from "@/models/Income";
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
  editedBy?: string;
  editedAt?: Date;
};

export interface TenantDetail {
  ownerKey: string;
  ownerType: GoodsOwnerType;
  profile: IGoodsOwner;
  records: RecordWithContainer[];
  incomes: (IIncome & { containerId: { _id: Types.ObjectId; name: string } | null })[];
  debts: OwnerContainerDebt[];
  totals: { accrued: number; paid: number; balance: number };
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

  const [records, incomes, debts] = await Promise.all([
    StorageRecord.find(recordFilter)
      .sort({ createdAt: -1 })
      .populate("containerId", "name")
      .lean() as unknown as Promise<RecordWithContainer[]>,
    Income.find({ ownerKey })
      .sort({ paidAt: -1 })
      .populate("containerId", "name")
      .lean() as unknown as Promise<(IIncome & { containerId: { _id: Types.ObjectId; name: string } | null })[]>,
    getAllOwnerContainerDebts({ ownerKey }),
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
  profile.addRows([
    { field: "Всего начислено", value: Math.round(detail.totals.accrued) },
    { field: "Всего оплачено", value: Math.round(detail.totals.paid) },
    { field: "Итоговая задолженность", value: Math.round(detail.totals.balance) },
  ]);
  profile.getRow(1).font = { bold: true };

  const recordsSheet = wb.addWorksheet("Записи");
  recordsSheet.columns = [
    { header: "Дата", key: "date", width: 18 },
    { header: "Контейнер", key: "container", width: 20 },
    { header: "Товар", key: "product", width: 26 },
    { header: "Количество", key: "quantity", width: 14 },
    { header: "Ед. изм.", key: "unit", width: 10 },
    { header: "Тариф", key: "tariff", width: 24 },
    { header: "№ договора", key: "contractNumber", width: 14 },
  ];
  for (const r of detail.records) {
    recordsSheet.addRow({
      date: new Date(r.createdAt).toLocaleString("ru-RU"),
      container: r.containerId?.name || "—",
      product: r.productName,
      quantity: r.quantity,
      unit: UNIT_LABELS[r.unit as keyof typeof UNIT_LABELS] || r.unit,
      tariff: formatTariffText(r.tariff as any),
      contractNumber: r.contractNumber || "—",
    });
  }
  recordsSheet.getRow(1).font = { bold: true };

  const incomeSheet = wb.addWorksheet("Оплаты");
  incomeSheet.columns = [
    { header: "Дата оплаты", key: "date", width: 18 },
    { header: "Контейнер", key: "container", width: 20 },
    { header: "Сумма", key: "amount", width: 14 },
    { header: "Способ", key: "method", width: 14 },
    { header: "Примечание", key: "note", width: 26 },
    { header: "Кто зафиксировал", key: "recordedBy", width: 20 },
  ];
  for (const inc of detail.incomes) {
    incomeSheet.addRow({
      date: new Date(inc.paidAt).toLocaleString("ru-RU"),
      container: inc.containerId?.name || "—",
      amount: Math.round(inc.amount),
      method: PAYMENT_METHOD_LABELS[inc.method] || inc.method,
      note: inc.note || "",
      recordedBy: inc.recordedBy,
    });
  }
  incomeSheet.getRow(1).font = { bold: true };

  const debtSheet = wb.addWorksheet("Задолженность");
  debtSheet.columns = [
    { header: "Контейнер", key: "container", width: 20 },
    { header: "С даты", key: "since", width: 18 },
    { header: "Начислено", key: "accrued", width: 14 },
    { header: "Оплачено", key: "paid", width: 14 },
    { header: "Остаток", key: "balance", width: 14 },
  ];
  for (const d of detail.debts) {
    debtSheet.addRow({
      container: d.containerName,
      since: new Date(d.since).toLocaleDateString("ru-RU"),
      accrued: Math.round(d.accrued),
      paid: Math.round(d.paid),
      balance: Math.round(d.balance),
    });
  }
  debtSheet.getRow(1).font = { bold: true };

  return wb.xlsx.writeBuffer();
}
