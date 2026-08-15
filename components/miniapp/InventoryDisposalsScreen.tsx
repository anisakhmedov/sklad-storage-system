"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch, haptic } from "./telegram";
import { useI18n } from "./i18n";
import { isPricelessItemName } from "@/lib/inventoryPricing";
import MiniAppHeader from "./MiniAppHeader";
import { DollarSign, PackageMinus, TriangleAlert, Package } from "lucide-react";

interface ContainerRef {
  id: string;
  name: string;
}

interface InventoryRow {
  _id: string;
  name: string;
  unit: string;
  available: number;
}

/**
 * Продажа/списание инвентаря — Mini App, тот же смысл, что и app/dashboard/inventory-disposals
 * на веб-панели (см. models/InventoryDisposalEntry.ts). Заменяет собой прежний экран
 * "Контейнеры для перевозки". Банковский перевод недоступен сотруднику (см.
 * lib/validation.ts::employeePaymentMethodEnum — тот же принцип, что и в AddIncomeWizard: перевод
 * идёт мимо сотрудника, он физически не может его подтвердить).
 *
 * «Ящики» (см. lib/inventoryPricing.ts::isPricelessItemName) сюда вообще не попадают — ни
 * продажа, ни списание для них не имеют смысла, это тара, которую только выдают клиенту и
 * принимают обратно (components/miniapp/InventorySection.tsx внутри карточки клиента), а не
 * расходуют/списывают со склада.
 */
export default function InventoryDisposalsScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containerId, setContainerId] = useState("");
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ item: InventoryRow; kind: "sale" | "writeoff" } | null>(null);

  useEffect(() => {
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => {
        const list: ContainerRef[] = d.containers || [];
        setContainers(list);
        setContainerId((prev) => prev || list[0]?.id || "");
      });
  }, []);

  const load = useCallback(
    async () => {
      if (!containerId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await miniAppFetch(`/api/miniapp/inventory?containerId=${containerId}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || t("disposals.loadError"));
          return;
        }
        setItems((data.items || []).filter((it: InventoryRow) => !isPricelessItemName(it.name)));
      } catch {
        setError(t("common.networkError"));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containerId]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="pt-4 pb-8">
      <MiniAppHeader title={t("disposals.title")} onBack={onExit} />

      {containers.length > 1 && (
        <select className="input mb-4" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon bg-rose-100 text-rose-600">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-ink-500">{t("disposals.noItems")}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => (
            <div key={item._id} className="rounded-2xl border border-ink-200 bg-white px-4 py-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="font-medium text-ink-900">{item.name}</span>
                <span className="text-sm text-ink-500 tabular-nums">
                  {t("disposals.available", { n: item.available, unit: item.unit })}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  className="btn-secondary flex-1"
                  disabled={item.available <= 0}
                  onClick={() => {
                    haptic.selection();
                    setActing({ item, kind: "sale" });
                  }}
                >
                  <DollarSign className="h-3.5 w-3.5" strokeWidth={2.1} />
                  {t("disposals.sell")}
                </button>
                <button
                  className="btn-secondary flex-1"
                  disabled={item.available <= 0}
                  onClick={() => {
                    haptic.selection();
                    setActing({ item, kind: "writeoff" });
                  }}
                >
                  <PackageMinus className="h-3.5 w-3.5" strokeWidth={2.1} />
                  {t("disposals.writeoff")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
  const { t } = useI18n();
  const methodLabels: Record<string, string> = { cash: t("method.cash"), card: t("method.card") };
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const qty = Number(quantity);
    if (!quantity || Number.isNaN(qty) || qty <= 0) {
      haptic.error();
      setError(t("disposals.quantityRequired"));
      return;
    }
    if (qty > item.available) {
      haptic.error();
      setError(t("disposals.notEnoughAvailable", { available: item.available, unit: item.unit }));
      return;
    }
    if (kind === "sale" && (!amount || Number(amount) <= 0)) {
      haptic.error();
      setError(t("disposals.amountRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/inventory/disposals", {
        method: "POST",
        body: JSON.stringify({
          itemId: item._id,
          containerId,
          kind,
          quantity,
          ...(kind === "sale" ? { amount, method } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        haptic.error();
        setError(data.error || t("disposals.saveError"));
        return;
      }
      haptic.success();
      onSaved();
    } catch {
      haptic.error();
      setError(t("common.networkError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <h3 className="card-title mb-4">
          {kind === "sale" ? t("disposals.sellTitle", { name: item.name }) : t("disposals.writeoffTitle", { name: item.name })}
        </h3>
        <div className="space-y-3">
          <input
            type="number"
            min="0"
            step="any"
            className="input"
            placeholder={t("disposals.quantityWithAvailable", { unit: item.unit, available: item.available })}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={busy}
            autoFocus
          />
          {kind === "sale" && (
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                className="input flex-1"
                placeholder={t("disposals.amountPlaceholder")}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <select className="input flex-1" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                {Object.entries(methodLabels).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
              {busy ? t("common.saving") : kind === "sale" ? t("disposals.sell") : t("disposals.writeoff")}
            </button>
            <button className="btn-secondary" onClick={onClose}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
