import ExcelJS from "exceljs";
import { connectDB } from "./db";
import { StorageRecord, GoodsOwnerType, Unit } from "@/models/StorageRecord";
// Побочный эффект: регистрирует схему "Container" до populate() ниже (см. пояснение в
// lib/contract/contractService.ts).
import "@/models/Container";
import { getAllOwnerContainerDebts } from "./debt";
import { getAllInventoryBalances } from "./inventoryLedger";
import { getAllBoxBalances } from "./boxes";
import { ownerKeyOf, ownerLabelOf } from "./ownerKey";

/**
 * Сводная таблица «Арендаторы по камерам» (см. app/dashboard/tenants/page.tsx, вид «Таблица по
 * камерам») — воспроизводит бумажный/Excel-журнал, который владелец вёл вручную по каждому
 * холодильнику: секция на контейнер → подсекция на камеру → строка на клиента с деньгами,
 * товаром (динамические колонки по фактическим названиям) и инвентарём/ящиками.
 *
 * Колонки товара и инвентаря вычисляются ОТДЕЛЬНО для каждого контейнера (не глобально по всей
 * базе) — у разных холодильников разный ассортимент тары/товара.
 */

export interface GoodsCell {
  value: number;
  unit: Unit; // "box"/"piece" для штучных колонок, "kg" для сводной колонки веса
  /** Ровно одна запись стоит за ячейкой — можно редактировать через POST /api/records/[id]/adjust.
   * Если у клиента несколько записей с одинаковым названием товара в этой камере, здесь будет
   * несколько id и точечное редактирование через таблицу недоступно (значение всё равно верное,
   * это сумма) — тогда правки делаются на странице "Записи". */
  recordIds: string[];
}

export interface TenantMatrixRow {
  ownerKey: string;
  ownerType: GoodsOwnerType;
  ownerLabel: string;
  balance: number;
  paid: number;
  goods: Record<string, GoodsCell>;
  inventory: Record<string, number>;
  boxesOutstanding?: number;
  boxRatePerBox?: number;
  /** № договора — показывается и редактируется только когда у клиента ровно одна запись
   * (StorageRecord) в этой камере: при нескольких записях непонятно, к какой из них относится
   * правка, поле остаётся пустым (см. lib/tenantMatrix.ts::getTenantMatrix). */
  contractNumber?: string;
  soleRecordId?: string;
}

export interface TenantMatrixCell {
  cellNumber: number;
  rows: TenantMatrixRow[];
}

export interface TenantMatrixSection {
  containerId: string;
  containerName: string;
  goodsColumns: string[];
  inventoryColumns: string[];
  hasBoxesColumn: boolean;
  cells: TenantMatrixCell[];
}

const KG_COLUMN = "Кг";

/** Приводит вес к кг (тонна → кг × 1000) — используется единая колонка "Кг" на весовой товар,
 * независимо от того, в чём он был изначально указан. */
function toKg(quantity: number, unit: Unit): number {
  return unit === "tonne" ? quantity * 1000 : quantity;
}

export async function getTenantMatrix(): Promise<TenantMatrixSection[]> {
  await connectDB();

  const [records, debts, inventoryBalances, boxBalances] = await Promise.all([
    StorageRecord.find()
      .sort({ createdAt: 1 })
      .populate<{ containerId: { _id: unknown; name: string } | null }>("containerId", "name")
      .lean(),
    getAllOwnerContainerDebts(),
    getAllInventoryBalances(),
    getAllBoxBalances(),
  ]);

  const balanceByGroup = new Map<string, { balance: number; paid: number }>();
  for (const d of debts) {
    balanceByGroup.set(`${d.ownerKey}::${d.containerId}`, { balance: d.balance, paid: d.paid });
  }

  // Инвентарь/ящики не привязаны к камере (InventoryLedgerEntry — не всегда, BoxLedgerEntry —
  // никогда), поэтому считаются на уровне владелец+контейнер и показываются одинаково во всех
  // камера-секциях этого владельца в этом контейнере.
  const inventoryByOwnerContainer = new Map<string, Map<string, number>>(); // ownerKey::containerId -> itemName -> outstanding
  const inventoryColumnsByContainer = new Map<string, Set<string>>();
  for (const b of inventoryBalances) {
    const groupKey = `${b.ownerKey}::${b.containerId}`;
    if (!inventoryByOwnerContainer.has(groupKey)) inventoryByOwnerContainer.set(groupKey, new Map());
    inventoryByOwnerContainer.get(groupKey)!.set(b.itemName, b.outstanding);
    if (!inventoryColumnsByContainer.has(b.containerId)) inventoryColumnsByContainer.set(b.containerId, new Set());
    inventoryColumnsByContainer.get(b.containerId)!.add(b.itemName);
  }

  const boxesByOwnerContainer = new Map<string, number>(); // ownerKey::containerId -> outstanding
  const boxRateByOwnerContainer = new Map<string, number>();
  const containersWithBoxes = new Set<string>();
  for (const b of boxBalances) {
    boxesByOwnerContainer.set(`${b.ownerKey}::${b.containerId}`, b.outstanding);
    boxRateByOwnerContainer.set(`${b.ownerKey}::${b.containerId}`, b.ratePerBox);
    containersWithBoxes.add(b.containerId);
  }

  // recordId -> № договора — для вычисления contractNumber/soleRecordId по завершении обхода
  // (см. финализацию строк ниже): узнать "ровно одна запись в этой камере" можно только после
  // того, как обработаны ВСЕ записи.
  const contractNumberByRecordId = new Map<string, string | undefined>();

  // containerId -> cellNumber -> ownerKey -> row-in-progress
  interface ContainerAgg {
    containerName: string;
    goodsColumns: Set<string>;
    cells: Map<number, Map<string, TenantMatrixRow>>;
  }
  const containers = new Map<string, ContainerAgg>();

  for (const r of records as any[]) {
    const containerRef = r.containerId as { _id: unknown; name: string } | null;
    if (!containerRef) continue; // контейнер удалён — запись сиротская, в сводную таблицу не попадает
    const containerId = String(containerRef._id);
    const containerName = containerRef.name || "—";
    const ownerKey = ownerKeyOf(r.goodsOwner);
    const ownerLabel = ownerLabelOf(r.goodsOwner);

    if (!containers.has(containerId)) {
      containers.set(containerId, { containerName, goodsColumns: new Set(), cells: new Map() });
    }
    const agg = containers.get(containerId)!;

    if (!agg.cells.has(r.cellNumber)) agg.cells.set(r.cellNumber, new Map());
    const rowsInCell = agg.cells.get(r.cellNumber)!;

    if (!rowsInCell.has(ownerKey)) {
      const groupKey = `${ownerKey}::${containerId}`;
      const balanceInfo = balanceByGroup.get(groupKey);
      const inventoryMap = inventoryByOwnerContainer.get(groupKey);
      rowsInCell.set(ownerKey, {
        ownerKey,
        ownerType: r.goodsOwner.type,
        ownerLabel,
        balance: balanceInfo?.balance || 0,
        paid: balanceInfo?.paid || 0,
        goods: {},
        inventory: inventoryMap ? Object.fromEntries(inventoryMap) : {},
        boxesOutstanding: boxesByOwnerContainer.get(groupKey),
        boxRatePerBox: boxRateByOwnerContainer.get(groupKey),
      });
    }
    const row = rowsInCell.get(ownerKey)!;
    contractNumberByRecordId.set(String(r._id), r.contractNumber);

    if (r.unit === "kg" || r.unit === "tonne") {
      const kg = toKg(r.quantity, r.unit as Unit);
      if (!row.goods[KG_COLUMN]) row.goods[KG_COLUMN] = { value: 0, unit: "kg", recordIds: [] };
      row.goods[KG_COLUMN].value += kg;
      row.goods[KG_COLUMN].recordIds.push(String(r._id));
      agg.goodsColumns.add(KG_COLUMN);
    } else {
      const column = r.productName.trim() || "Товар";
      if (!row.goods[column]) row.goods[column] = { value: 0, unit: r.unit as Unit, recordIds: [] };
      row.goods[column].value += r.quantity;
      row.goods[column].recordIds.push(String(r._id));
      agg.goodsColumns.add(column);
    }
  }

  const sections: TenantMatrixSection[] = [];
  for (const [containerId, agg] of containers) {
    // "Кг" всегда последней колонкой товара, остальные — по алфавиту (как штучная тара).
    const goodsColumns = Array.from(agg.goodsColumns)
      .filter((c) => c !== KG_COLUMN)
      .sort((a, b) => a.localeCompare(b, "ru"));
    if (agg.goodsColumns.has(KG_COLUMN)) goodsColumns.push(KG_COLUMN);

    const inventoryColumns = Array.from(inventoryColumnsByContainer.get(containerId) || []).sort((a, b) =>
      a.localeCompare(b, "ru")
    );

    const cells = Array.from(agg.cells.entries())
      .sort(([a], [b]) => a - b)
      .map(([cellNumber, rowsMap]) => ({
        cellNumber,
        rows: Array.from(rowsMap.values())
          .map((row) => {
            const allRecordIds = Object.values(row.goods).flatMap((g) => g.recordIds);
            if (allRecordIds.length === 1) {
              row.soleRecordId = allRecordIds[0];
              row.contractNumber = contractNumberByRecordId.get(allRecordIds[0]);
            }
            return row;
          })
          .sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru")),
      }));

    sections.push({
      containerId,
      containerName: agg.containerName,
      goodsColumns,
      inventoryColumns,
      hasBoxesColumn: containersWithBoxes.has(containerId),
      cells,
    });
  }

  return sections.sort((a, b) => a.containerName.localeCompare(b.containerName, "ru"));
}

/** Excel-версия сводной таблицы — один лист на контейнер, внутри секции по камерам, визуально
 * повторяет вид на веб-странице (см. GET /api/tenants/matrix/export). */
export async function buildTenantMatrixWorkbook(sections: TenantMatrixSection[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sklad";
  wb.created = new Date();

  for (const section of sections) {
    // Имена листов Excel ограничены 31 символом и не терпят некоторые спецсимволы.
    const sheetName = section.containerName.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Контейнер";
    const sheet = wb.addWorksheet(sheetName || `Контейнер ${sections.indexOf(section) + 1}`);

    const headers = [
      "№",
      "Наименование клиента",
      "Остаток денег",
      "Оплачено",
      ...section.goodsColumns,
      "Описание / договор",
      ...section.inventoryColumns,
      ...(section.hasBoxesColumn ? ["Ящики"] : []),
      "К получению",
    ];

    for (const cell of section.cells) {
      const titleRow = sheet.addRow([`${section.containerName} — камера ${cell.cellNumber}`]);
      titleRow.font = { bold: true, size: 12 };
      sheet.mergeCells(titleRow.number, 1, titleRow.number, headers.length);

      const headerRow = sheet.addRow(headers);
      headerRow.font = { bold: true };
      headerRow.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3C623" } };
        c.border = { bottom: { style: "thin" } };
      });

      cell.rows.forEach((row, idx) => {
        sheet.addRow([
          idx + 1,
          row.ownerLabel,
          Math.round(row.balance),
          Math.round(row.paid),
          ...section.goodsColumns.map((col) => row.goods[col]?.value || ""),
          row.contractNumber || "",
          ...section.inventoryColumns.map((col) => row.inventory[col] || ""),
          ...(section.hasBoxesColumn ? [row.boxesOutstanding || ""] : []),
          Math.round(row.balance),
        ]);
      });

      sheet.addRow([]); // разделитель между камерами
    }

    sheet.columns.forEach((col, idx) => {
      col.width = idx === 1 ? 28 : 14;
    });
  }

  if (sections.length === 0) {
    wb.addWorksheet("Арендаторы").addRow(["Данных пока нет"]);
  }

  return wb.xlsx.writeBuffer();
}
