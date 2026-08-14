"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import BoxSection from "./BoxSection";
import InventorySection from "./InventorySection";
import {
  ArrowLeft,
  UserRound,
  Building2,
  Boxes,
  Plus,
  Minus,
  TriangleAlert,
  RefreshCw,
} from "lucide-react";

type OwnerType = "individual" | "company";
type Unit = "tonne" | "kg" | "box" | "piece";

const UNIT_LABELS: Record<Unit, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

interface SummaryItem {
  recordId: string;
  productName: string;
  quantity: number;
  unit: Unit;
}

interface SummaryContainer {
  containerId: string;
  containerName: string;
  items: SummaryItem[];
  accrued: number;
  paid: number;
  balance: number;
}

interface Summary {
  recordCount: number;
  containers: SummaryContainer[];
  totalBalance: number;
}

interface BoxBalance {
  containerId: string;
  outstanding: number;
  ratePerBox: number;
  owedAmount: number;
}

interface InventoryBalance {
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

export default function ClientDetail({
  owner,
  onBack,
}: {
  owner: { ownerKey: string; ownerLabel: string; ownerType: OwnerType };
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [boxBalances, setBoxBalances] = useState<BoxBalance[]>([]);
  const [inventoryBalances, setInventoryBalances] = useState<InventoryBalance[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, boxesRes, inventoryRes, inventoryItemsRes] = await Promise.all([
        miniAppFetch(`/api/miniapp/clients/${encodeURIComponent(owner.ownerKey)}`),
        miniAppFetch(`/api/miniapp/boxes/${encodeURIComponent(owner.ownerKey)}`),
        miniAppFetch(`/api/miniapp/inventory/${encodeURIComponent(owner.ownerKey)}`),
        miniAppFetch(`/api/miniapp/inventory`),
      ]);
      const data = await summaryRes.json().catch(() => ({}));
      if (!summaryRes.ok) {
        setError(data.error || "Не удалось загрузить данные клиента");
        return;
      }
      setSummary(data.summary);
      const boxData = await boxesRes.json().catch(() => ({}));
      setBoxBalances(boxesRes.ok ? boxData.balances || [] : []);
      const inventoryData = await inventoryRes.json().catch(() => ({}));
      setInventoryBalances(inventoryRes.ok ? inventoryData.balances || [] : []);
      const inventoryItemsData = await inventoryItemsRes.json().catch(() => ({}));
      setInventoryItems(inventoryItemsRes.ok ? inventoryItemsData.items || [] : []);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, [owner.ownerKey]);

  useEffect(() => {
    load();
  }, [load]);

  const OwnerIcon = owner.ownerType === "individual" ? UserRound : Building2;

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center justify-between mb-3">
        <button className="btn-icon btn-ghost -ml-2" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <button className="btn-icon btn-ghost" onClick={load} aria-label="Обновить">
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <OwnerIcon className="h-5 w-5" strokeWidth={2.1} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-900 tracking-tight truncate">{owner.ownerLabel}</h1>
          <p className="text-xs text-ink-400">{owner.ownerType === "individual" ? "Физ. лицо" : "Юр. лицо"}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="skeleton h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon bg-rose-100 text-rose-600">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      ) : !summary || summary.containers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Boxes className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-ink-500">Нет доступных записей по этому клиенту.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {summary.containers.map((c) => (
            <ContainerCard
              key={c.containerId}
              container={c}
              owner={owner}
              boxBalance={boxBalances.find((b) => b.containerId === c.containerId)}
              inventoryBalances={inventoryBalances.filter((b) => b.containerId === c.containerId)}
              inventoryItems={inventoryItems}
              onChanged={load}
            />
          ))}

          <div className="rounded-2xl bg-ink-50 px-4 py-3.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ink-700">Итого задолженность</span>
            <span className={`text-sm font-semibold ${summary.totalBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {money(summary.totalBalance)} сум
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ContainerCard({
  container,
  owner,
  boxBalance,
  inventoryBalances,
  inventoryItems,
  onChanged,
}: {
  container: SummaryContainer;
  owner: { ownerKey: string; ownerLabel: string; ownerType: OwnerType };
  boxBalance: BoxBalance | undefined;
  inventoryBalances: InventoryBalance[];
  inventoryItems: InventoryItemRef[];
  onChanged: () => void;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Boxes className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
        <h3 className="font-medium text-ink-900">{container.containerName}</h3>
      </div>

      <div className="space-y-2.5">
        {container.items.map((item) => (
          <ItemRow key={item.recordId} item={item} onChanged={onChanged} />
        ))}
      </div>

      <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between text-xs">
        <span className="text-ink-400">Остаток по контейнеру</span>
        <span className={container.balance > 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"}>
          {money(container.balance)} сум
        </span>
      </div>

      <BoxSection owner={owner} containerId={container.containerId} balance={boxBalance} onChanged={onChanged} />
      <InventorySection
        owner={owner}
        containerId={container.containerId}
        balances={inventoryBalances}
        items={inventoryItems}
        onChanged={onChanged}
      />
    </div>
  );
}

function ItemRow({ item, onChanged }: { item: SummaryItem; onChanged: () => void }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adjust(sign: 1 | -1) {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Укажите количество");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch(`/api/miniapp/records/${item.recordId}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta: sign * value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setAmount("");
      onChanged();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl bg-ink-50/60 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-ink-800 truncate">{item.productName}</span>
        <span className="text-sm text-ink-500 tabular-nums shrink-0 ml-2">
          {item.quantity} {UNIT_LABELS[item.unit]}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          step="any"
          className="input h-8 text-sm flex-1"
          placeholder="Кол-во"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
        <button
          className="btn-icon btn-secondary h-8 w-8"
          disabled={busy}
          onClick={() => adjust(1)}
          aria-label="Добавить"
          title="Добавить"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button
          className="btn-icon btn-danger-ghost h-8 w-8"
          disabled={busy}
          onClick={() => adjust(-1)}
          aria-label="Убавить"
          title="Убавить"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
