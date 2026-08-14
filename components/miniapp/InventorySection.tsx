"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";
import { PackagePlus, PackageMinus, Package } from "lucide-react";

type OwnerType = "individual" | "company";

interface InventoryBalanceRow {
  itemId: string;
  itemName: string;
  containerId: string;
  outstanding: number;
}

interface InventoryItemRef {
  _id: string;
  name: string;
  unit: string;
}

/**
 * Блок «Инвентарь» внутри карточки контейнера у клиента (components/miniapp/ClientDetail.tsx)
 * — учёт складского инвентаря (поддоны/рохля и т.п., см. models/InventoryItem.ts), выданного
 * этому клиенту в этом контейнере, отдельно от товара и от «Ящиков» (BoxSection.tsx рядом).
 * Баланс передаётся сверху (одним запросом на всего клиента — GET
 * /api/miniapp/inventory/[ownerKey], см. ClientDetail), здесь только список остатков и форма
 * выдать/принять по конкретной позиции → существующий POST /api/miniapp/inventory (тот же, что
 * и на веб-панели — уже создаёт акт и пишет в аудит-лог).
 */
export default function InventorySection({
  owner,
  containerId,
  cellNumber,
  balances,
  items,
  onChanged,
}: {
  owner: { ownerKey: string; ownerType: OwnerType; ownerLabel: string };
  containerId: string;
  cellNumber?: number;
  balances: InventoryBalanceRow[];
  items: InventoryItemRef[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(direction: "given" | "returned") {
    if (!itemId) {
      setError("Выберите позицию инвентаря");
      return;
    }
    const qty = Number(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      setError("Укажите количество");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/inventory", {
        method: "POST",
        body: JSON.stringify({
          itemId,
          ownerKey: owner.ownerKey,
          ownerType: owner.ownerType,
          ownerLabel: owner.ownerLabel,
          containerId,
          cellNumber,
          direction,
          quantity: qty,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setQuantity("");
      setOpen(false);
      onChanged();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-100">
      <button className="w-full flex items-center justify-between text-xs" onClick={() => setOpen((v) => !v)}>
        <span className="text-ink-400 inline-flex items-center gap-1">
          <Package className="h-3.5 w-3.5" strokeWidth={2} />
          Инвентарь на руках
        </span>
        <span className="text-ink-500 font-medium">{open ? "Скрыть" : "Показать"}</span>
      </button>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          {balances.length === 0 ? (
            <p className="text-xs text-ink-400 text-center py-1">ПУСТО</p>
          ) : (
            <div className="space-y-1">
              {balances.map((b) => (
                <div key={b.itemId} className="flex items-center justify-between text-xs rounded-lg bg-ink-50/60 px-2.5 py-1.5">
                  <span className="text-ink-700">{b.itemName}</span>
                  <span className="font-medium text-ink-800 tabular-nums">{b.outstanding}</span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-ink-50/60 px-3 py-2.5 space-y-1.5">
            <select className="input h-8 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)} disabled={busy}>
              <option value="">Выберите позицию</option>
              {items.map((it) => (
                <option key={it._id} value={it._id}>
                  {it.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="any"
              className="input h-8 text-sm"
              placeholder="Количество"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
            />
            <div className="flex items-center gap-1.5">
              <button className="btn-secondary btn-sm flex-1" disabled={busy} onClick={() => submit("given")}>
                <PackagePlus className="h-3.5 w-3.5" strokeWidth={2} />
                Выдал
              </button>
              <button className="btn-secondary btn-sm flex-1" disabled={busy} onClick={() => submit("returned")}>
                <PackageMinus className="h-3.5 w-3.5" strokeWidth={2} />
                Принял
              </button>
            </div>
            {error && <p className="text-xs text-rose-600">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
