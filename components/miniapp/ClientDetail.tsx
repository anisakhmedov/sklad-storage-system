"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import BoxSection from "./BoxSection";
import InventorySection from "./InventorySection";
import {
  TARIFF_TYPES,
  TARIFF_LABELS,
  formatTariffText,
  isTariffCompatibleWithUnit,
  suggestedEndDate,
  TariffType,
} from "@/lib/tariff";
import {
  ArrowLeft,
  UserRound,
  Building2,
  Boxes,
  Plus,
  Minus,
  TriangleAlert,
  RefreshCw,
  Pencil,
  Lock,
  Unlock,
  X,
  History,
} from "lucide-react";

type OwnerType = "individual" | "company";
type Unit = "tonne" | "kg" | "box" | "piece";

const UNIT_LABELS: Record<Unit, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const toDateInputValue = (iso: string) => iso.slice(0, 10);

interface HistoryEvent {
  kind: string;
  date: string;
  containerName: string;
  cellNumber?: number;
  itemLabel: string;
  quantityText?: string;
  amount?: number;
  method?: string;
  createdBy: string;
}

const METHOD_LABELS: Record<string, string> = { cash: "Наличные", terminal: "Терминал", transfer: "Перевод", card: "Карта (П2П)" };
const HISTORY_KIND_LABELS: Record<string, string> = {
  goods_given: "Приём товара",
  goods_returned: "Отдача товара",
  inventory_given: "Выдача инвентаря",
  inventory_returned: "Возврат инвентаря",
  box_given: "Выдача ящиков",
  box_returned: "Приём ящиков",
  payment: "Оплата",
};

interface SummaryItem {
  recordId: string;
  productName: string;
  quantity: number;
  unit: Unit;
  tariff?: { type: TariffType; rate: number };
  createdAt: string;
  expectedEndDate?: string;
  closedAt?: string;
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
  // У каждого контейнера свой инвентарь (см. models/InventoryItem.ts::containerId) — карточка
  // каждого контейнера получает СВОЙ список позиций, а не общий на всех.
  const [inventoryItemsByContainer, setInventoryItemsByContainer] = useState<Map<string, InventoryItemRef[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, boxesRes, inventoryRes] = await Promise.all([
        miniAppFetch(`/api/miniapp/clients/${encodeURIComponent(owner.ownerKey)}`),
        miniAppFetch(`/api/miniapp/boxes/${encodeURIComponent(owner.ownerKey)}`),
        miniAppFetch(`/api/miniapp/inventory/${encodeURIComponent(owner.ownerKey)}`),
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

      // Список позиций инвентаря известен только контейнерам клиента — известны они только
      // после ответа summary, поэтому запрашиваются вторым заходом, по одному на контейнер.
      const containerIds: string[] = (data.summary?.containers || []).map((c: { containerId: string }) => c.containerId);
      const itemLists = await Promise.all(
        containerIds.map((id) => miniAppFetch(`/api/miniapp/inventory?containerId=${id}`).then((r) => r.json().catch(() => ({}))))
      );
      const map = new Map<string, InventoryItemRef[]>();
      containerIds.forEach((id, i) => map.set(id, itemLists[i]?.items || []));
      setInventoryItemsByContainer(map);
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

      <HistorySection ownerKey={owner.ownerKey} />

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
              inventoryItems={inventoryItemsByContainer.get(c.containerId) || []}
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

/**
 * Единая хронологическая история клиента (приём/отдача товара, выдача/возврат инвентаря и
 * ящиков, оплаты) — см. GET /api/miniapp/clients/[ownerKey]/history, lib/tenantHistory.ts.
 * Свёрнута по умолчанию и подгружается по клику — сама карточка клиента и так тяжёлая,
 * не грузим историю, пока сотрудник её явно не запросил.
 */
function HistorySection({ ownerKey }: { ownerKey: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const res = await miniAppFetch(`/api/miniapp/clients/${encodeURIComponent(ownerKey)}/history`);
        const data = await res.json().catch(() => ({}));
        setEvents(res.ok ? data.events || [] : []);
        setLoaded(true);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-ink-200 bg-white">
      <button className="w-full flex items-center justify-between px-4 py-3" onClick={toggle}>
        <span className="text-sm font-medium text-ink-800 inline-flex items-center gap-1.5">
          <History className="h-4 w-4 text-ink-400" strokeWidth={2} />
          История операций
        </span>
        <span className="text-xs text-ink-400">{open ? "Скрыть" : "Показать"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-xs text-ink-400 text-center py-2">Операций пока не было.</p>
          ) : (
            events.map((h, idx) => (
              <div key={idx} className="rounded-xl bg-ink-50/60 px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-ink-800">{HISTORY_KIND_LABELS[h.kind] || h.kind}</span>
                  <span className="text-ink-400">{new Date(h.date).toLocaleString("ru-RU")}</span>
                </div>
                <div className="text-ink-500">
                  {h.containerName}
                  {h.cellNumber ? ` · камера ${h.cellNumber}` : ""} · {h.itemLabel}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-ink-600 font-medium">
                    {h.kind === "payment"
                      ? `${money(h.amount || 0)} сум${h.method ? ` · ${METHOD_LABELS[h.method] || h.method}` : ""}`
                      : h.quantityText || ""}
                  </span>
                  <span className="text-ink-400">{h.createdBy}</span>
                </div>
              </div>
            ))
          )}
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

  // Раскрывающаяся панель "Изменить" — даты договора/окончания и тариф (см.
  // PATCH /api/miniapp/records/[id]). Количество не входит — для него отдельный +/- ниже
  // (это добавление/списание, а не перезапись числа).
  const [editing, setEditing] = useState(false);
  const [editCreatedAt, setEditCreatedAt] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editTariffType, setEditTariffType] = useState<TariffType>(item.tariff?.type || "per_day");
  const [editTariffRate, setEditTariffRate] = useState(String(item.tariff?.rate ?? 0));
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Отдельная маленькая форма закрытия ("товар забран") — только дата, не смешана с editing
  // выше, чтобы не путать "поправить" и "закрыть навсегда" в одной панели.
  const [closing, setClosing] = useState(false);
  const [closeDate, setCloseDate] = useState("");
  const [closeBusy, setCloseBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  async function adjust(sign: 1 | -1) {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Укажите количество");
      return;
    }
    if (sign === -1 && value > item.quantity) {
      setError(`На хранении только ${item.quantity} ${UNIT_LABELS[item.unit]} — нельзя списать больше`);
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

  function openEdit() {
    setEditError(null);
    setEditCreatedAt(toDateInputValue(item.createdAt));
    setEditEndDate(item.expectedEndDate ? toDateInputValue(item.expectedEndDate) : "");
    setEditTariffType(item.tariff?.type || "per_day");
    setEditTariffRate(String(item.tariff?.rate ?? 0));
    setEditing(true);
  }

  async function saveEdit() {
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await miniAppFetch(`/api/miniapp/records/${item.recordId}`, {
        method: "PATCH",
        body: JSON.stringify({
          createdAt: new Date(editCreatedAt).toISOString(),
          ...(editEndDate ? { expectedEndDate: new Date(editEndDate).toISOString() } : {}),
          tariff: { type: editTariffType, rate: Number(editTariffRate) },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error || "Не удалось сохранить");
        return;
      }
      setEditing(false);
      onChanged();
    } catch {
      setEditError("Не удалось связаться с сервером");
    } finally {
      setEditBusy(false);
    }
  }

  async function saveClose() {
    setCloseBusy(true);
    setCloseError(null);
    try {
      const res = await miniAppFetch(`/api/miniapp/records/${item.recordId}/close`, {
        method: "POST",
        body: JSON.stringify({ closedAt: new Date(closeDate || Date.now()).toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCloseError(data.error || "Не удалось закрыть запись");
        return;
      }
      setClosing(false);
      onChanged();
    } catch {
      setCloseError("Не удалось связаться с сервером");
    } finally {
      setCloseBusy(false);
    }
  }

  async function reopen() {
    setCloseBusy(true);
    try {
      await miniAppFetch(`/api/miniapp/records/${item.recordId}/close`, {
        method: "POST",
        body: JSON.stringify({ closedAt: null }),
      });
      onChanged();
    } finally {
      setCloseBusy(false);
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

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="text-xs text-ink-400 truncate">
          {item.tariff ? formatTariffText(item.tariff) : "—"}
          {item.expectedEndDate && !item.closedAt && (
            <> · до {new Date(item.expectedEndDate).toLocaleDateString("ru-RU")}</>
          )}
          {item.closedAt && (
            <span className="badge bg-rose-100 text-rose-700 ml-1.5">
              закрыта {new Date(item.closedAt).toLocaleDateString("ru-RU")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="btn-icon btn-secondary h-7 w-7"
            onClick={() => (editing ? setEditing(false) : openEdit())}
            aria-label="Изменить"
            title="Изменить даты/тариф"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          {item.closedAt ? (
            <button
              className="btn-icon btn-secondary h-7 w-7"
              disabled={closeBusy}
              onClick={reopen}
              aria-label="Открыть заново"
              title="Открыть заново"
            >
              <Unlock className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : (
            <button
              className="btn-icon btn-secondary h-7 w-7"
              onClick={() => {
                setCloseError(null);
                setCloseDate(toDateInputValue(new Date().toISOString()));
                setClosing((v) => !v);
              }}
              aria-label="Закрыть (товар забран)"
              title="Закрыть (товар забран)"
            >
              <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="rounded-lg border border-ink-200 bg-white p-2.5 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Дата договора</label>
              <input
                type="date"
                className="input h-8 text-sm"
                value={editCreatedAt}
                onChange={(e) => setEditCreatedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Окончание</label>
              <input
                type="date"
                className="input h-8 text-sm"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input h-8 text-sm"
              value={editTariffType}
              onChange={(e) => {
                const t = e.target.value as TariffType;
                setEditTariffType(t);
                const suggestion = suggestedEndDate(t, new Date(editCreatedAt || Date.now()));
                if (suggestion) setEditEndDate(toDateInputValue(suggestion.toISOString()));
              }}
            >
              {TARIFF_TYPES.filter((t) => isTariffCompatibleWithUnit(t, item.unit)).map((t) => (
                <option key={t} value={t}>
                  {TARIFF_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="input h-8 text-sm"
              placeholder="Ставка"
              value={editTariffRate}
              onChange={(e) => setEditTariffRate(e.target.value)}
            />
          </div>
          {editError && <p className="text-xs text-rose-600">{editError}</p>}
          <div className="flex gap-1.5">
            <button className="btn-primary h-8 text-xs flex-1" disabled={editBusy} onClick={saveEdit}>
              {editBusy ? "Сохранение…" : "Сохранить"}
            </button>
            <button className="btn-icon btn-ghost h-8 w-8" onClick={() => setEditing(false)} aria-label="Отмена">
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {closing && (
        <div className="rounded-lg border border-ink-200 bg-white p-2.5 mb-2 space-y-2">
          <p className="text-xs text-ink-500">
            Начисление тарифа остановится на эту дату, товар считается забранным.
          </p>
          <input
            type="date"
            className="input h-8 text-sm"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
          {closeError && <p className="text-xs text-rose-600">{closeError}</p>}
          <div className="flex gap-1.5">
            <button className="btn-primary h-8 text-xs flex-1" disabled={closeBusy} onClick={saveClose}>
              {closeBusy ? "Сохранение…" : "Закрыть запись"}
            </button>
            <button className="btn-icon btn-ghost h-8 w-8" onClick={() => setClosing(false)} aria-label="Отмена">
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

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
