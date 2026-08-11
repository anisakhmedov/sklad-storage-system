"use client";

import { useEffect, useMemo, useState } from "react";
import { miniAppFetch } from "./telegram";
import ClientDetail from "./ClientDetail";
import { ArrowLeft, Search, UserRound, Building2, ChevronRight, Users, TriangleAlert } from "lucide-react";

type OwnerType = "individual" | "company";

interface OwnerContainerDebt {
  ownerType: OwnerType;
  ownerKey: string;
  ownerLabel: string;
  balance: number;
}

interface OwnerRow {
  ownerKey: string;
  ownerType: OwnerType;
  ownerLabel: string;
  balance: number;
}

/**
 * Список клиентов (владельцев груза) — переиспользует GET /api/miniapp/debts (уже
 * отфильтрован по доступным сотруднику контейнерам, см. lib/miniAuth.ts::allowedContainerIds)
 * и группирует по ownerKey, как это уже делает AddIncomeWizard.tsx.
 */
export default function ClientsList({ onExit }: { onExit: () => void }) {
  const [debts, setDebts] = useState<OwnerContainerDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OwnerRow | null>(null);

  useEffect(() => {
    miniAppFetch("/api/miniapp/debts")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setLoadError(d.error || "Не удалось загрузить список клиентов");
          return;
        }
        setDebts(d.debts || []);
      })
      .catch(() => setLoadError("Не удалось связаться с сервером"))
      .finally(() => setLoading(false));
  }, []);

  const owners = useMemo(() => {
    const map = new Map<string, OwnerRow>();
    for (const d of debts) {
      const existing = map.get(d.ownerKey);
      if (existing) existing.balance += d.balance;
      else map.set(d.ownerKey, { ownerKey: d.ownerKey, ownerType: d.ownerType, ownerLabel: d.ownerLabel, balance: d.balance });
    }
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [debts]);

  const filtered = owners.filter((o) => o.ownerLabel.toLowerCase().includes(query.trim().toLowerCase()));

  if (selected) {
    return <ClientDetail owner={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">Клиенты</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-300" strokeWidth={2} />
        <input
          className="input pl-9"
          placeholder="Поиск по имени"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <div className="empty-state-icon bg-rose-100 text-rose-600">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-rose-600">{loadError}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-ink-500">
            {owners.length === 0 ? "Клиентов пока нет." : "Ничего не найдено."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const Icon = o.ownerType === "individual" ? UserRound : Building2;
            return (
              <button
                key={o.ownerKey}
                onClick={() => setSelected(o)}
                className="w-full flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink-900 truncate">{o.ownerLabel}</div>
                  <div className={`text-xs mt-0.5 ${o.balance > 0 ? "text-rose-500" : "text-ink-400"}`}>
                    {o.balance > 0 ? `Долг: ${Math.round(o.balance).toLocaleString("ru-RU")} сум` : "Задолженности нет"}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-300 shrink-0" strokeWidth={2} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
