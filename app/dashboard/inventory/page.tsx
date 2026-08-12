"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Package, ArrowRightLeft, X } from "lucide-react";

interface InventoryRow {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  outstanding: number;
  available: number;
}

interface ContainerRef {
  _id: string;
  name: string;
}

interface OwnerContainerDebt {
  ownerKey: string;
  ownerType: "individual" | "company";
  ownerLabel: string;
  containerId: string;
  containerName: string;
}

interface LedgerEntry {
  _id: string;
  itemName: string;
  ownerLabel: string;
  containerId: { _id: string; name: string } | string;
  cellNumber?: number;
  direction: "given" | "returned";
  quantity: number;
  createdBy: string;
  createdAt: string;
}

/**
 * Полноценная страница "Инвентарь" — остаток по каждой позиции (общее/выдано/свободно) и
 * приход/уход по контейнеру и камере (см. models/InventoryLedgerEntry.ts). Быстрый виджет
 * управления позициями остаётся на "Обзоре" (components/dashboard/InventoryPanel.tsx) —
 * здесь фокус на движениях (кому выдано, куда, когда).
 */
export default function InventoryLedgerPage() {
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [debts, setDebts] = useState<OwnerContainerDebt[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ containerId: "", cellNumber: "" });
  const [lendItem, setLendItem] = useState<InventoryRow | null>(null);

  const loadItems = useCallback(async () => {
    const res = await fetch("/api/inventory");
    const data = await res.json().catch(() => ({}));
    setItems(data.items || []);
  }, []);

  const loadEntries = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.containerId) params.set("containerId", filters.containerId);
    if (filters.cellNumber) params.set("cellNumber", filters.cellNumber);
    const res = await fetch(`/api/inventory/ledger?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setEntries(data.entries || []);
  }, [filters]);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
    fetch("/api/debts")
      .then((r) => r.json())
      .then((d) => setDebts(d.debts || []));
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    setLoading(true);
    loadEntries().finally(() => setLoading(false));
  }, [loadEntries]);

  async function refreshAll() {
    await Promise.all([loadItems(), loadEntries()]);
  }

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Инвентарь</h1>
        <p className="text-sm text-ink-400 mt-1">
          Остаток по каждой позиции и приход/уход инвентаря у клиентов по контейнеру и камере.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {items.length === 0 ? (
          <div className="card col-span-full">
            <div className="empty-state py-6">
              <p className="text-sm text-ink-500">
                Позиций инвентаря пока нет — добавьте их в блоке "Инвентарь" на странице "Обзор".
              </p>
            </div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item._id} className="card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-medium text-ink-800 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 text-brand-600 shrink-0" strokeWidth={2} />
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="text-xs text-ink-400 mt-1">
                    Остаток: <span className="font-medium text-ink-700">{item.available}</span> / Всего: {item.quantity}
                    {item.outstanding > 0 && <span> · у клиентов: {item.outstanding}</span>}
                  </div>
                </div>
              </div>
              <button className="btn-secondary btn-sm w-full" onClick={() => setLendItem(item)}>
                <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />
                Выдать / принять
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Контейнер</label>
            <select
              className="input"
              value={filters.containerId}
              onChange={(e) => setFilters({ ...filters, containerId: e.target.value })}
            >
              <option value="">Все</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Камера</label>
            <select
              className="input"
              value={filters.cellNumber}
              onChange={(e) => setFilters({ ...filters, cellNumber: e.target.value })}
            >
              <option value="">Все</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  Камера {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">Движений инвентаря не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Позиция</th>
                <th>Контейнер</th>
                <th>Камера</th>
                <th>Клиент</th>
                <th>Направление</th>
                <th>Кол-во</th>
                <th>Кто оформил</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td className="whitespace-nowrap text-ink-500">{new Date(e.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="font-medium text-ink-800">{e.itemName}</td>
                  <td>{typeof e.containerId === "object" ? e.containerId.name : e.containerId}</td>
                  <td className="text-ink-600">{e.cellNumber ?? "—"}</td>
                  <td className="text-ink-600">{e.ownerLabel}</td>
                  <td>
                    <span className={`badge ${e.direction === "given" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {e.direction === "given" ? "Выдано клиенту" : "Возвращено на склад"}
                    </span>
                  </td>
                  <td className="tabular-nums">{e.quantity}</td>
                  <td className="text-ink-500">{e.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {lendItem && (
        <LendModal
          item={lendItem}
          debts={debts}
          containers={containers}
          onClose={() => setLendItem(null)}
          onSaved={() => {
            setLendItem(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
}

function LendModal({
  item,
  debts,
  containers,
  onClose,
  onSaved,
}: {
  item: InventoryRow;
  debts: OwnerContainerDebt[];
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const owners = useMemo(() => {
    const map = new Map<string, OwnerContainerDebt>();
    for (const d of debts) if (!map.has(d.ownerKey)) map.set(d.ownerKey, d);
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [debts]);

  const [ownerKey, setOwnerKey] = useState("");
  const [containerId, setContainerId] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [direction, setDirection] = useState<"given" | "returned">("given");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const owner = owners.find((o) => o.ownerKey === ownerKey);
    if (!owner || !containerId) {
      setError("Выберите клиента и контейнер");
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
          ownerKey: owner.ownerKey,
          ownerType: owner.ownerType,
          ownerLabel: owner.ownerLabel,
          containerId,
          cellNumber: cellNumber || undefined,
          direction,
          quantity,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title">Выдать/принять «{item.name}»</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-3">
          <div className="flex gap-1 text-xs">
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${
                direction === "given" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"
              }`}
              onClick={() => setDirection("given")}
            >
              Выдать клиенту
            </button>
            <button
              type="button"
              className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${
                direction === "returned" ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500"
              }`}
              onClick={() => setDirection("returned")}
            >
              Принять от клиента
            </button>
          </div>

          <div>
            <label className="label">Клиент</label>
            <select className="input" value={ownerKey} onChange={(e) => setOwnerKey(e.target.value)}>
              <option value="">Выберите клиента</option>
              {owners.map((o) => (
                <option key={o.ownerKey} value={o.ownerKey}>
                  {o.ownerLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Контейнер</label>
              <select className="input" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
                <option value="">Выберите</option>
                {containers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Камера (необязательно)</label>
              <select className="input" value={cellNumber} onChange={(e) => setCellNumber(e.target.value)}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    Камера {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Количество, {item.unit}</label>
            <input
              type="number"
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
            <button className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
