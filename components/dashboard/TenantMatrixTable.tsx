"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, Loader2, RefreshCw, X } from "lucide-react";

type OwnerType = "individual" | "company";
type Unit = "tonne" | "kg" | "box" | "piece";

interface GoodsCellRecord {
  recordId: string;
  productName: string;
  displayQuantity: number;
  nativeUnit: Unit;
  nativeQuantity: number;
}

interface GoodsCell {
  value: number;
  unit: Unit;
  records: GoodsCellRecord[];
}

interface TenantMatrixRow {
  ownerKey: string;
  ownerType: OwnerType;
  ownerLabel: string;
  balance: number;
  paid: number;
  goods: Record<string, GoodsCell>;
  inventory: Record<string, number>;
  boxesOutstanding?: number;
  boxesGiven?: number;
  boxesReturned?: number;
  boxRatePerBox?: number;
  contractNumber?: string;
  soleRecordId?: string;
}

interface TenantMatrixCell {
  cellNumber: number;
  rows: TenantMatrixRow[];
}

interface TenantMatrixSection {
  containerId: string;
  containerName: string;
  goodsColumns: string[];
  inventoryColumns: string[];
  hasBoxesColumn: boolean;
  cells: TenantMatrixCell[];
}

interface InventoryItemRef {
  _id: string;
  name: string;
  unit: string;
  containerId?: string;
}

const UNIT_LABELS: Record<Unit, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };
const money = (n: number) => (n ? Math.round(n).toLocaleString("ru-RU") : "");
const num = (n: number | undefined) => (n ? n.toLocaleString("ru-RU") : "");
/** Итоговая строка "Итого по камере" в конце каждой камера-таблицы (см. рендер ниже) — сумма
 * колонки по всем строкам камеры. Для инвентаря/ящиков суммирование внутри ОДНОЙ камеры
 * корректно (каждый клиент встречается в ней ровно один раз), хотя сама величина одинакова
 * по всем камера-таблицам этого клиента в этом контейнере (см. lib/tenantMatrix.ts). */
const sum = (rows: TenantMatrixRow[], pick: (r: TenantMatrixRow) => number) => rows.reduce((s, r) => s + pick(r), 0);

type EditTarget =
  | {
      kind: "goods";
      ownerLabel: string;
      containerName: string;
      cellNumber: number;
      column: string;
      // Обычно один элемент; несколько — когда у клиента в этой камере несколько записей с
      // одинаковым названием товара (или несколько весовых записей, слитых в колонку "Кг") —
      // тогда форма сначала просит выбрать, какую именно запись менять (см. GoodsForm ниже).
      records: GoodsCellRecord[];
    }
  | {
      kind: "payment";
      ownerType: OwnerType;
      ownerKey: string;
      ownerLabel: string;
      containerId: string;
      containerName: string;
      cellNumber: number;
    }
  | {
      kind: "inventory";
      ownerType: OwnerType;
      ownerKey: string;
      ownerLabel: string;
      containerId: string;
      containerName: string;
      cellNumber: number;
      itemName: string;
      currentValue: number;
    }
  | {
      kind: "boxes";
      ownerType: OwnerType;
      ownerKey: string;
      ownerLabel: string;
      containerId: string;
      containerName: string;
      currentValue: number;
      rate?: number;
    };

/**
 * Вид «Таблица по камерам» страницы «Арендаторы» — сводная таблица в духе бумажного/Excel-
 * журнала владельца (см. lib/tenantMatrix.ts): секция на холодильник → подсекция на камеру →
 * строка на клиента. Пустые ячейки визуально пустые, но кликабельны (можно завести первую
 * выдачу инвентаря/ящиков или добавить платёж) — правки идут через уже существующие эндпоинты
 * (акты и аудит-лог создаются там же, эта таблица их не дублирует).
 */
export default function TenantMatrixTable({ isOwner, containerId }: { isOwner: boolean; containerId?: string }) {
  const [sections, setSections] = useState<TenantMatrixSection[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  // Фильтр по камере — имеет смысл только когда выбран один контейнер (см. containerId выше),
  // иначе номера камер разных холодильников перемешались бы. Сбрасывается при смене контейнера.
  const [cellNumber, setCellNumber] = useState("");

  useEffect(() => {
    setCellNumber("");
  }, [containerId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tenants/matrix");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить таблицу");
        return;
      }
      setSections(data.sections || []);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (isOwner) {
      fetch("/api/inventory")
        .then((r) => r.json())
        .then((d) => setInventoryItems(d.items || []))
        .catch(() => {});
    }
  }, [load, isOwner]);

  // Ключ включает containerId — у каждого контейнера свой инвентарь (см.
  // models/InventoryItem.ts::containerId), поэтому одноимённые позиции в разных контейнерах
  // должны разрешаться в РАЗНЫЕ записи, а не схлопываться в одну по имени.
  const inventoryItemByName = useMemo(() => {
    const map = new Map<string, InventoryItemRef>();
    for (const item of inventoryItems) map.set(`${item.containerId}::${item.name}`, item);
    return map;
  }, [inventoryItems]);

  // Фильтр по контейнеру (из page-level селекта) + по камере (свой, см. cellNumber выше) —
  // камера сужает только когда контейнер уже выбран однозначно, иначе номера пересекались бы
  // между разными холодильниками.
  const visibleSections = useMemo(() => {
    let list = containerId ? sections.filter((s) => s.containerId === containerId) : sections;
    if (containerId && cellNumber) {
      list = list.map((s) => ({ ...s, cells: s.cells.filter((c) => String(c.cellNumber) === cellNumber) }));
    }
    return list;
  }, [sections, containerId, cellNumber]);

  const cellOptions = useMemo(() => {
    if (!containerId) return [];
    const section = sections.find((s) => s.containerId === containerId);
    return section ? section.cells.map((c) => c.cellNumber) : [];
  }, [sections, containerId]);

  if (loading) {
    return (
      <div className="card">
        <div className="space-y-2.5 p-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-11 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert-danger">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
        <span>{error}</span>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p className="text-sm text-ink-500">Данных пока нет — как только появятся записи о размещении товара, здесь построится таблица.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <button className="btn-secondary btn-sm" onClick={load} title="Обновить">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Обновить
          </button>
          {containerId && cellOptions.length > 0 && (
            <select className="input h-8 text-sm w-auto" value={cellNumber} onChange={(e) => setCellNumber(e.target.value)}>
              <option value="">Все камеры</option>
              {cellOptions.map((n) => (
                <option key={n} value={n}>
                  Камера {n}
                </option>
              ))}
            </select>
          )}
        </div>
        <a href="/api/tenants/matrix/export" className="btn-primary btn-sm">
          <Download className="h-3.5 w-3.5" strokeWidth={2.1} />
          Экспорт в Excel
        </a>
      </div>

      {visibleSections.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p className="text-sm text-ink-500">По этому фильтру ничего не нашлось.</p>
          </div>
        </div>
      ) : (
      <div className="space-y-8">
        {visibleSections.map((section) => (
          <div key={section.containerId}>
            <h2 className="text-base font-semibold text-ink-800 mb-3">{section.containerName}</h2>
            <div className="space-y-6">
              {section.cells.map((cell) => (
                <div key={cell.cellNumber} className="card overflow-x-auto">
                  <h3 className="text-sm font-semibold text-ink-700 mb-3">
                    {section.containerName} — камера {cell.cellNumber}
                  </h3>
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>Наименование клиента</th>
                        <th>Остаток</th>
                        <th>Оплата</th>
                        {section.goodsColumns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                        <th>Описание / договор</th>
                        {section.inventoryColumns.map((col) => (
                          <th key={col} title="Общий остаток по клиенту в этом контейнере (не по камере)">
                            {col}
                          </th>
                        ))}
                        {section.hasBoxesColumn && (
                          <th title="Общий остаток по клиенту в этом контейнере (не по камере)">Ящики</th>
                        )}
                        <th>К получению</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cell.rows.map((row, idx) => (
                        <tr key={row.ownerKey}>
                          <td className="text-ink-400">{idx + 1}</td>
                          <td className="font-medium text-ink-800 whitespace-nowrap">
                            <Link href={`/dashboard/tenants/${encodeURIComponent(row.ownerKey)}`} className="hover:text-brand-600">
                              {row.ownerLabel}
                            </Link>
                          </td>
                          <td className={`tabular-nums ${row.balance > 0 ? "text-rose-600 font-medium" : ""}`}>
                            {money(row.balance)}
                          </td>
                          <td className="tabular-nums">
                            <Cell
                              value={money(row.paid)}
                              clickable={isOwner}
                              onClick={() =>
                                setEditing({
                                  kind: "payment",
                                  ownerType: row.ownerType,
                                  ownerKey: row.ownerKey,
                                  ownerLabel: row.ownerLabel,
                                  containerId: section.containerId,
                                  containerName: section.containerName,
                                  cellNumber: cell.cellNumber,
                                })
                              }
                            />
                          </td>
                          {section.goodsColumns.map((col) => {
                            const g = row.goods[col];
                            const clickable = isOwner && !!g && g.records.length > 0;
                            return (
                              <td key={col} className="tabular-nums">
                                <Cell
                                  value={num(g?.value)}
                                  clickable={clickable}
                                  onClick={() => {
                                    if (!g) return;
                                    setEditing({
                                      kind: "goods",
                                      ownerLabel: row.ownerLabel,
                                      containerName: section.containerName,
                                      cellNumber: cell.cellNumber,
                                      column: col,
                                      records: g.records,
                                    });
                                  }}
                                />
                              </td>
                            );
                          })}
                          <td>
                            <ContractCell row={row} onSaved={load} editable={isOwner} />
                          </td>
                          {section.inventoryColumns.map((col) => (
                            <td key={col} className="tabular-nums">
                              <Cell
                                value={num(row.inventory[col])}
                                clickable={isOwner}
                                onClick={() =>
                                  setEditing({
                                    kind: "inventory",
                                    ownerType: row.ownerType,
                                    ownerKey: row.ownerKey,
                                    ownerLabel: row.ownerLabel,
                                    containerId: section.containerId,
                                    containerName: section.containerName,
                                    cellNumber: cell.cellNumber,
                                    itemName: col,
                                    currentValue: row.inventory[col] || 0,
                                  })
                                }
                              />
                            </td>
                          ))}
                          {section.hasBoxesColumn && (
                            <td className="tabular-nums">
                              <Cell
                                value={num(row.boxesOutstanding)}
                                clickable={isOwner}
                                onClick={() =>
                                  setEditing({
                                    kind: "boxes",
                                    ownerType: row.ownerType,
                                    ownerKey: row.ownerKey,
                                    ownerLabel: row.ownerLabel,
                                    containerId: section.containerId,
                                    containerName: section.containerName,
                                    currentValue: row.boxesOutstanding || 0,
                                    rate: row.boxRatePerBox,
                                  })
                                }
                              />
                              {/* Раскладка net-остатка — выдано/принято за всё время (см.
                                  lib/boxes.ts::BoxBalance.given/returned), не только текущий
                                  остаток. Пусто, если ни разу не было ни того, ни другого. */}
                              {(row.boxesGiven || row.boxesReturned) && (
                                <div className="text-xs text-ink-400 font-normal whitespace-nowrap">
                                  выдано {num(row.boxesGiven) || 0} · принято {num(row.boxesReturned) || 0}
                                </div>
                              )}
                            </td>
                          )}
                          <td className={`tabular-nums ${row.balance > 0 ? "text-rose-600 font-medium" : ""}`}>
                            {money(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold border-t-2 border-ink-200">
                        <td colSpan={2} className="text-ink-700">
                          Итого по камере
                        </td>
                        <td className="tabular-nums">{money(sum(cell.rows, (r) => r.balance))}</td>
                        <td className="tabular-nums">{money(sum(cell.rows, (r) => r.paid))}</td>
                        {section.goodsColumns.map((col) => (
                          <td key={col} className="tabular-nums">
                            {num(sum(cell.rows, (r) => r.goods[col]?.value || 0))}
                          </td>
                        ))}
                        <td />
                        {section.inventoryColumns.map((col) => (
                          <td key={col} className="tabular-nums">
                            {num(sum(cell.rows, (r) => r.inventory[col] || 0))}
                          </td>
                        ))}
                        {section.hasBoxesColumn && (
                          <td className="tabular-nums">{num(sum(cell.rows, (r) => r.boxesOutstanding || 0))}</td>
                        )}
                        <td className="tabular-nums">{money(sum(cell.rows, (r) => r.balance))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {editing && (
        <EditModal
          target={editing}
          inventoryItemByName={inventoryItemByName}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Ячейка таблицы: пустое значение рисуем пустым (по требованию — никаких "0"/"—"), но пока
 * остаётся кликабельной областью, если правка доступна — иначе просто текст. */
function Cell({ value, clickable, onClick }: { value: string; clickable: boolean; onClick: () => void }) {
  if (!clickable) return <span>{value}</span>;
  return (
    <button
      type="button"
      className="block w-full min-w-[2.5rem] min-h-[1.5rem] text-left rounded-md px-1 -mx-1 hover:bg-brand-50 hover:text-brand-700 transition-colors"
      onClick={onClick}
      title="Изменить"
    >
      {value}
    </button>
  );
}

function ContractCell({ row, editable, onSaved }: { row: TenantMatrixRow; editable: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(row.contractNumber || "");
  const [busy, setBusy] = useState(false);

  if (!editable || !row.soleRecordId) {
    return <span className="text-ink-500">{row.contractNumber || ""}</span>;
  }

  if (!open) {
    return (
      <button
        type="button"
        className="block w-full min-w-[3rem] text-left rounded-md px-1 -mx-1 hover:bg-brand-50 hover:text-brand-700 transition-colors text-ink-500"
        onClick={() => {
          setValue(row.contractNumber || "");
          setOpen(true);
        }}
      >
        {row.contractNumber || ""}
      </button>
    );
  }

  async function commit() {
    setBusy(true);
    try {
      await fetch(`/api/records/${row.soleRecordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractNumber: value }),
      });
      onSaved();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <input
      className="input h-7 text-xs w-32"
      autoFocus
      value={value}
      disabled={busy}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setOpen(false);
      }}
    />
  );
}

/**
 * Диспетчер по виду правки — сами формы вынесены в отдельные компоненты (GoodsForm/PaymentForm/
 * InventoryForm/BoxesForm), а не в ветки одной функции: у каждого вида своя форма (свои
 * useState), а React требует одинаковый порядок вызова хуков на каждый рендер компонента —
 * держать это правило верным при условных ветках внутри одной функции слишком легко случайно
 * сломать при следующей правке, отдельные компоненты избавляют от этого риска в принципе.
 */
function EditModal({
  target,
  inventoryItemByName,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  inventoryItemByName: Map<string, InventoryItemRef>;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (target.kind === "goods") return <GoodsForm target={target} onClose={onClose} onSaved={onSaved} />;
  if (target.kind === "payment") return <PaymentForm target={target} onClose={onClose} onSaved={onSaved} />;
  if (target.kind === "inventory")
    return <InventoryForm target={target} inventoryItemByName={inventoryItemByName} onClose={onClose} onSaved={onSaved} />;
  return <BoxesForm target={target} onClose={onClose} onSaved={onSaved} />;
}

function GoodsForm({
  target,
  onClose,
  onSaved,
}: {
  target: Extract<EditTarget, { kind: "goods" }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("");
  // Несколько записей за одной ячейкой (напр. клиент дважды привозил тот же товар, или
  // несколько весовых записей слиты в колонку "Кг") — сначала выбираем, какую именно менять.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = target.records[selectedIndex];

  // Ячейка "Кг" показывает вес в кг независимо от того, в чём он хранится в самой записи —
  // тонны переведены ×1000 (см. lib/tenantMatrix.ts::toKg). Введённая здесь добавка тоже в кг,
  // поэтому перед отправкой на /adjust (который пишет прямо в record.quantity, в НАТИВНОЙ
  // единице) её нужно перевести обратно — иначе "прибавить 500 кг" превратило бы запись в
  // тоннах в 500 лишних ТОНН вместо 0.5.
  function toNativeDelta(displayDelta: number): number {
    return selected.nativeUnit === "tonne" ? displayDelta / 1000 : displayDelta;
  }

  async function submit(sign: 1 | -1) {
    const v = Number(delta);
    if (!delta || Number.isNaN(v) || v <= 0) {
      setError("Укажите количество");
      return;
    }
    if (sign === -1 && v > selected.displayQuantity) {
      setError(`На хранении только ${num(selected.displayQuantity) || 0} — нельзя списать больше`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/records/${selected.recordId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta: sign * toNativeDelta(v) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${target.ownerLabel} · ${target.column}`} onClose={onClose}>
      <p className="text-xs text-ink-400 mb-2">
        {target.containerName}, камера {target.cellNumber} · сейчас {num(selected.displayQuantity)}
      </p>
      {target.records.length > 1 && (
        <select
          className="input mb-2"
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(Number(e.target.value))}
          disabled={busy}
        >
          {target.records.map((r, i) => (
            <option key={r.recordId} value={i}>
              {r.productName} · {r.nativeQuantity} {UNIT_LABELS[r.nativeUnit]}
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        min="0"
        step="any"
        className="input"
        placeholder="Количество"
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        disabled={busy}
        autoFocus
      />
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      <div className="flex gap-2 pt-3">
        <button className="btn-primary flex-1" disabled={busy} onClick={() => submit(1)}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Добавить
        </button>
        <button className="btn-secondary flex-1" disabled={busy} onClick={() => submit(-1)}>
          Списать
        </button>
      </div>
    </Modal>
    );
}

function PaymentForm({
  target,
  onClose,
  onSaved,
}: {
  target: Extract<EditTarget, { kind: "payment" }>;
  onClose: () => void;
  onSaved: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    async function submit() {
      const v = Number(amount);
      if (!amount || Number.isNaN(v) || v <= 0) {
        setError("Укажите сумму");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/income", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ownerType: target.ownerType,
            ownerKey: target.ownerKey,
            ownerLabel: target.ownerLabel,
            containerId: target.containerId,
            cellNumber: target.cellNumber,
            amount,
            method,
            paidAt: new Date().toISOString().slice(0, 10),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Ошибка");
          return;
        }
        onSaved();
      } finally {
        setBusy(false);
      }
    }
    return (
      <Modal title={`Оплата — ${target.ownerLabel}`} onClose={onClose}>
        <p className="text-xs text-ink-400 mb-2">
          {target.containerName}, камера {target.cellNumber}
        </p>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="any"
            className="input flex-1"
            placeholder="Сумма, сум"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <select className="input flex-1" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
            <option value="cash">Наличные</option>
            <option value="transfer">Перевод</option>
            <option value="card">Карта (П2П)</option>
          </select>
        </div>
        {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 pt-3">
          <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Записать оплату
          </button>
        </div>
      </Modal>
    );
}

function InventoryForm({
  target,
  inventoryItemByName,
  onClose,
  onSaved,
}: {
  target: Extract<EditTarget, { kind: "inventory" }>;
  inventoryItemByName: Map<string, InventoryItemRef>;
  onClose: () => void;
  onSaved: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const item = inventoryItemByName.get(`${target.containerId}::${target.itemName}`);
    const [quantity, setQuantity] = useState("");
    const [direction, setDirection] = useState<"given" | "returned">("given");
    async function submit() {
      if (!item) {
        setError("Позиция инвентаря не найдена — обновите страницу");
        return;
      }
      const v = Number(quantity);
      if (!quantity || Number.isNaN(v) || v <= 0) {
        setError("Укажите количество");
        return;
      }
      if (direction === "returned" && v > target.currentValue) {
        setError(`У клиента сейчас только ${num(target.currentValue) || 0} — нельзя принять больше`);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/inventory/ledger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item._id,
            ownerType: target.ownerType,
            ownerKey: target.ownerKey,
            ownerLabel: target.ownerLabel,
            containerId: target.containerId,
            cellNumber: target.cellNumber,
            direction,
            quantity,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Ошибка");
          return;
        }
        onSaved();
      } finally {
        setBusy(false);
      }
    }
    return (
      <Modal title={`${target.ownerLabel} · ${target.itemName}`} onClose={onClose}>
        <p className="text-xs text-ink-400 mb-2">
          {target.containerName} · сейчас на руках {num(target.currentValue)}
        </p>
        <div className="flex gap-1 text-xs mb-2">
          <button
            type="button"
            className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${direction === "given" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"}`}
            onClick={() => setDirection("given")}
          >
            Выдать
          </button>
          <button
            type="button"
            className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${direction === "returned" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"}`}
            onClick={() => setDirection("returned")}
          >
            Принять
          </button>
        </div>
        <input
          type="number"
          min="0"
          step="any"
          className="input"
          placeholder="Количество"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={busy}
          autoFocus
        />
        {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
        <div className="flex gap-2 pt-3">
          <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Сохранить
          </button>
        </div>
      </Modal>
    );
}

function BoxesForm({
  target,
  onClose,
  onSaved,
}: {
  target: Extract<EditTarget, { kind: "boxes" }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<"given" | "returned">("given");
  const [rate, setRate] = useState(target.rate ? String(target.rate) : "");
  async function submitBoxes() {
    const v = Number(quantity);
    const rateNum = Number(rate);
    if (!quantity || Number.isNaN(v) || v <= 0) {
      setError("Укажите количество ящиков");
      return;
    }
    if (!rate || Number.isNaN(rateNum) || rateNum < 0) {
      setError("Укажите ставку за ящик");
      return;
    }
    if (direction === "returned" && v > target.currentValue) {
      setError(`У клиента сейчас только ${num(target.currentValue) || 0} ящ. — нельзя принять больше`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/boxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerType: target.ownerType,
          ownerKey: target.ownerKey,
          ownerLabel: target.ownerLabel,
          containerId: target.containerId,
          direction,
          quantity,
          ratePerBox: rateNum,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Ящики — ${target.ownerLabel}`} onClose={onClose}>
      <p className="text-xs text-ink-400 mb-2">
        {target.containerName} · сейчас должен {num(target.currentValue)}
      </p>
      <div className="flex gap-1 text-xs mb-2">
        <button
          type="button"
          className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${direction === "given" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"}`}
          onClick={() => setDirection("given")}
        >
          Выдал
        </button>
        <button
          type="button"
          className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${direction === "returned" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"}`}
          onClick={() => setDirection("returned")}
        >
          Принял
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="1"
          className="input flex-1"
          placeholder="Кол-во ящиков"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={busy}
          autoFocus
        />
        <input
          type="number"
          min="0"
          step="any"
          className="input flex-1"
          placeholder="Ставка, сум/ящ."
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={busy}
        />
      </div>
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      <div className="flex gap-2 pt-3">
        <button className="btn-primary flex-1" disabled={busy} onClick={submitBoxes}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Сохранить
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="card-title">{title}</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
