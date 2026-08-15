"use client";

import { useEffect, useState, useCallback } from "react";
import { PackageMinus, DollarSign, Trash2 } from "lucide-react";
import { isPricelessItemName } from "@/lib/inventoryPricing";

interface ContainerRef {
  _id: string;
  name: string;
}

interface InventoryRow {
  _id: string;
  name: string;
  unit: string;
  quantity: number;
  outstanding: number;
  available: number;
}

interface DisposalEntry {
  _id: string;
  itemName: string;
  containerId: { _id: string; name: string } | string;
  kind: "sale" | "writeoff";
  quantity: number;
  amount?: number;
  method?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

const methodLabels: Record<string, string> = { cash: "Наличные", transfer: "Перевод", card: "Карта (П2П)" };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

/**
 * Продажа/списание инвентаря — заменяет собой прежний раздел "Контейнеры для перевозки"
 * (убран полностью, см. models/InventoryDisposalEntry.ts). У каждого контейнера свой инвентарь
 * (см. models/InventoryItem.ts::containerId), поэтому список позиций и история движений здесь
 * всегда привязаны к выбранному контейнеру.
 */
export default function InventoryDisposalsPage() {
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containerId, setContainerId] = useState("");
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [entries, setEntries] = useState<DisposalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<{ item: InventoryRow; kind: "sale" | "writeoff" } | null>(null);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => {
        const list: ContainerRef[] = d.containers || [];
        setContainers(list);
        setContainerId((prev) => prev || list[0]?._id || "");
      });
  }, []);

  const load = useCallback(async () => {
    if (!containerId) {
      setItems([]);
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [itemsRes, entriesRes] = await Promise.all([
      fetch(`/api/inventory?containerId=${containerId}`),
      fetch(`/api/inventory/disposals?containerId=${containerId}`),
    ]);
    const itemsData = await itemsRes.json().catch(() => ({}));
    setItems(itemsData.items || []);
    const entriesData = await entriesRes.json().catch(() => ({}));
    setEntries(entriesData.entries || []);
    setLoading(false);
  }, [containerId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Продажа / списание инвентаря</h1>
        <p className="text-sm text-ink-400 mt-1">
          Уменьшает свободный остаток позиции (то, что не выдано клиентам) — продажа с суммой, списание без.
        </p>
      </div>

      <div className="card mb-6 max-w-xs">
        <label className="label">Контейнер</label>
        <select className="input" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
          {containers.length === 0 && <option value="">Нет контейнеров</option>}
          {containers.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 w-full" />)
        ) : items.length === 0 ? (
          <div className="card col-span-full">
            <div className="empty-state py-6">
              <p className="text-sm text-ink-500">
                В этом контейнере пока нет позиций инвентаря — добавьте их на странице «Инвентарь».
              </p>
            </div>
          </div>
        ) : (
          items.map((item) => (
            <div key={item._id} className="card">
              <div className="font-medium text-ink-800 mb-1">{item.name}</div>
              <div className="text-xs text-ink-400 mb-3">
                Свободно: <span className="font-medium text-ink-700">{item.available}</span> {item.unit}
              </div>
              <div className="flex gap-1.5">
                {!isPricelessItemName(item.name) && (
                  <button
                    className="btn-secondary btn-sm flex-1"
                    disabled={item.available <= 0}
                    onClick={() => setActing({ item, kind: "sale" })}
                  >
                    <DollarSign className="h-3.5 w-3.5" strokeWidth={2} />
                    Продать
                  </button>
                )}
                <button
                  className="btn-secondary btn-sm flex-1"
                  disabled={item.available <= 0}
                  onClick={() => setActing({ item, kind: "writeoff" })}
                >
                  <PackageMinus className="h-3.5 w-3.5" strokeWidth={2} />
                  Списать
                </button>
              </div>
              {isPricelessItemName(item.name) && (
                <p className="text-[11px] text-ink-400 mt-1.5">У ящиков нет цены — доступно только списание.</p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Trash2 className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Продаж и списаний по этому контейнеру пока нет.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Позиция</th>
                <th>Тип</th>
                <th>Кол-во</th>
                <th>Сумма</th>
                <th>Кто оформил</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td className="whitespace-nowrap text-ink-500">{new Date(e.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="font-medium text-ink-800">{e.itemName}</td>
                  <td>
                    <span className={`badge ${e.kind === "sale" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                      {e.kind === "sale" ? "Продажа" : "Списание"}
                    </span>
                  </td>
                  <td className="tabular-nums">{e.quantity}</td>
                  <td className="tabular-nums text-ink-700">
                    {e.amount ? `${money(e.amount)} сум${e.method ? ` · ${methodLabels[e.method] || e.method}` : ""}` : "—"}
                  </td>
                  <td className="text-ink-500">{e.createdBy}</td>
                  <td className="text-ink-500">{e.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {acting && (
        <DisposalModal
          item={acting.item}
          kind={acting.kind}
          containerId={containerId}
          onClose={() => setActing(null)}
          onSaved={() => {
            setActing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function DisposalModal({
  item,
  kind,
  containerId,
  onClose,
  onSaved,
}: {
  item: InventoryRow;
  kind: "sale" | "writeoff";
  containerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const qty = Number(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      setError("Укажите количество");
      return;
    }
    if (qty > item.available) {
      setError(`Свободно только ${item.available} ${item.unit} — нельзя больше`);
      return;
    }
    if (kind === "sale" && (!amount || Number(amount) <= 0)) {
      setError("Укажите сумму продажи");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/disposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item._id,
          containerId,
          kind,
          quantity,
          ...(kind === "sale" ? { amount, method } : {}),
          note,
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
      <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-title mb-4">
          {kind === "sale" ? "Продать" : "Списать"} «{item.name}»
        </h3>
        <div className="space-y-3">
          <div>
            <label className="label">Количество, {item.unit} (свободно {item.available})</label>
            <input
              type="number"
              min="0"
              step="any"
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          {kind === "sale" && (
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
              />
              <select className="input flex-1" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                <option value="cash">Наличные</option>
                <option value="transfer">Перевод</option>
                <option value="card">Карта (П2П)</option>
              </select>
            </div>
          )}
          <div>
            <label className="label">Примечание (необязательно)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
              {busy ? "Сохранение…" : kind === "sale" ? "Продать" : "Списать"}
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
