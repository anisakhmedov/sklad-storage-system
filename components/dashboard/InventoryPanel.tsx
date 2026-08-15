"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, Plus, Minus, Trash2, PackagePlus } from "lucide-react";

interface InventoryRow {
  _id: string;
  name: string;
  quantity: number; // общее количество
  unit: string;
  containerId?: string;
  note?: string;
  outstanding?: number; // на руках у клиентов (см. models/InventoryLedgerEntry.ts)
  available?: number; // свободный остаток на складе = quantity − outstanding
}

interface ContainerRef {
  _id: string;
  name: string;
}

// Подсказки для быстрого добавления типовых позиций — не ограничивает список, просто
// сокращает ввод для того, что явно просили (поддоны, ящики, рохля, кара).
const SUGGESTIONS = ["Поддоны", "Ящики", "Рохля", "Кара"];

/**
 * Складской инвентарь на странице «Обзор» — доступен только владельцу (см. app/api/inventory).
 * У каждого контейнера свой инвентарь (см. models/InventoryItem.ts::containerId) — виджет
 * показывает позиции ОДНОГО выбранного контейнера за раз; полная картина по всем контейнерам
 * и движения — на отдельной странице "Инвентарь" (app/dashboard/inventory/page.tsx).
 */
export default function InventoryPanel() {
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containerId, setContainerId] = useState("");
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

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
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/inventory?containerId=${containerId}`);
    const data = await res.json().catch(() => ({}));
    setItems(data.items || []);
    setLoading(false);
  }, [containerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addItem(name: string) {
    if (!name.trim() || !containerId) return;
    setBusyId("new");
    try {
      await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), quantity: 0, containerId }),
      });
      setNewName("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function adjust(item: InventoryRow, delta: number) {
    const next = Math.max(0, item.quantity + delta);
    setBusyId(item._id);
    try {
      await fetch(`/api/inventory/${item._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить позицию инвентаря?")) return;
    setBusyId(id);
    try {
      await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const existingNames = new Set(items.map((i) => i.name.toLowerCase()));

  return (
    <div className="card mt-6">
      <div className="card-header">
        <div>
          <h2 className="card-title flex items-center gap-2">
            <Package className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Инвентарь
          </h2>
          <p className="card-subtitle">Складской инструмент — только вы видите этот блок.</p>
        </div>
        {containers.length > 1 && (
          <select
            className="input h-8 text-sm w-auto"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
          >
            {containers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {containers.length === 0 ? (
        <p className="text-sm text-ink-500 py-4">Сначала создайте контейнер (холодильник) на странице "Контейнеры".</p>
      ) : loading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-11 w-full" />
          ))}
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="empty-state py-6">
              <p className="text-sm text-ink-500">Инвентаря пока нет — добавьте первую позицию.</p>
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-xl border border-ink-200 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-ink-800 truncate block">{item.name}</span>
                    {!!item.outstanding && (
                      <span className="text-[11px] text-ink-400">
                        Остаток: {item.available} / Всего: {item.quantity} (у клиентов: {item.outstanding})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="btn-icon btn-secondary h-7 w-7"
                      disabled={busyId === item._id}
                      onClick={() => adjust(item, -1)}
                      aria-label="Убавить"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                    <span className="tabular-nums text-sm font-medium text-ink-900 w-10 text-center">
                      {item.quantity}
                    </span>
                    <button
                      className="btn-icon btn-secondary h-7 w-7"
                      disabled={busyId === item._id}
                      onClick={() => adjust(item, 1)}
                      aria-label="Добавить"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                    <button
                      className="btn-icon btn-danger-ghost h-7 w-7"
                      disabled={busyId === item._id}
                      onClick={() => remove(item._id)}
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {SUGGESTIONS.some((s) => !existingNames.has(s.toLowerCase())) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SUGGESTIONS.filter((s) => !existingNames.has(s.toLowerCase())).map((s) => (
                <button key={s} className="btn-secondary btn-sm" onClick={() => addItem(s)} disabled={busyId === "new"}>
                  <PackagePlus className="h-3.5 w-3.5" strokeWidth={2} />
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Другая позиция…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem(newName)}
            />
            <button className="btn-primary shrink-0" disabled={busyId === "new"} onClick={() => addItem(newName)}>
              Добавить
            </button>
          </div>
        </>
      )}
    </div>
  );
}
