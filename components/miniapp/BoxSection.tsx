"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";
import { PackagePlus, PackageMinus } from "lucide-react";

type OwnerType = "individual" | "company";

interface BoxBalance {
  containerId: string;
  outstanding: number;
  ratePerBox: number;
  owedAmount: number;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

/**
 * Блок «Ящики» внутри карточки контейнера у клиента (components/miniapp/ClientDetail.tsx) —
 * учёт выданных/возвращённых ящиков, отдельно от товара (см. models/BoxLedgerEntry.ts,
 * lib/boxes.ts). Баланс передаётся сверху (одним запросом на всего клиента, см. ClientDetail),
 * здесь только форма выдачи/приёма для конкретного контейнера.
 */
export default function BoxSection({
  owner,
  containerId,
  balance,
  onChanged,
}: {
  owner: { ownerKey: string; ownerType: OwnerType; ownerLabel: string };
  containerId: string;
  balance: BoxBalance | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [rate, setRate] = useState(balance?.ratePerBox ? String(balance.ratePerBox) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(direction: "given" | "returned") {
    const qty = Number(quantity);
    const rateNum = Number(rate);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      setError("Укажите количество ящиков");
      return;
    }
    if (!rate || Number.isNaN(rateNum) || rateNum < 0) {
      setError("Укажите ставку за ящик");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch(`/api/miniapp/boxes/${encodeURIComponent(owner.ownerKey)}`, {
        method: "POST",
        body: JSON.stringify({
          ownerType: owner.ownerType,
          ownerLabel: owner.ownerLabel,
          containerId,
          direction,
          quantity: qty,
          ratePerBox: rateNum,
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

  const outstanding = balance?.outstanding || 0;

  return (
    <div className="mt-3 pt-3 border-t border-ink-100">
      <button
        className="w-full flex items-center justify-between text-xs"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-ink-400">Ящики должен</span>
        <span className={outstanding > 0 ? "text-rose-600 font-medium" : "text-ink-500 font-medium"}>
          {outstanding} шт{balance?.owedAmount ? ` · ${money(balance.owedAmount)} сум` : ""}
        </span>
      </button>

      {open && (
        <div className="mt-2.5 rounded-xl bg-ink-50/60 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              step="1"
              className="input h-8 text-sm flex-1"
              placeholder="Кол-во ящиков"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={busy}
            />
            <input
              type="number"
              min="0"
              step="any"
              className="input h-8 text-sm flex-1"
              placeholder="Ставка, сум/ящ."
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="btn-secondary btn-sm flex-1"
              disabled={busy}
              onClick={() => submit("given")}
            >
              <PackagePlus className="h-3.5 w-3.5" strokeWidth={2} />
              Выдал
            </button>
            <button
              className="btn-secondary btn-sm flex-1"
              disabled={busy}
              onClick={() => submit("returned")}
            >
              <PackageMinus className="h-3.5 w-3.5" strokeWidth={2} />
              Принял
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
