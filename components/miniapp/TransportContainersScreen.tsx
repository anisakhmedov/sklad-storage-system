"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import { ArrowLeft, Truck, PackageCheck, PackageX, TriangleAlert } from "lucide-react";

interface TransportContainerRow {
  _id: string;
  label: string;
  status: "in_use" | "free";
  currentOwnerLabel?: string;
}

/**
 * Контейнеры для перевозки — сотрудник может выдать клиенту или отметить свободным, БЕЗ актов
 * (см. models/TransportContainer.ts). Освобождение — основной сценарий по ТЗ: клиент привёз
 * груз и освободил контейнер, сотрудник должен это зафиксировать.
 */
export default function TransportContainersScreen({ onExit }: { onExit: () => void }) {
  const [containers, setContainers] = useState<TransportContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [giving, setGiving] = useState<TransportContainerRow | null>(null);
  const [ownerLabel, setOwnerLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/transport-containers");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить контейнеры");
        return;
      }
      setContainers(data.containers || []);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function free(id: string) {
    setBusyId(id);
    try {
      await miniAppFetch(`/api/miniapp/transport-containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "free" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function give() {
    if (!giving || !ownerLabel.trim()) return;
    setBusyId(giving._id);
    try {
      const res = await miniAppFetch(`/api/miniapp/transport-containers/${giving._id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "give", currentOwnerLabel: ownerLabel.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setGiving(null);
      setOwnerLabel("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">Контейнеры для перевозки</h1>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon bg-rose-100 text-rose-600">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      ) : containers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Truck className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-ink-500">Контейнеров для перевозки пока нет.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {containers.map((c) => (
            <div
              key={c._id}
              className={`rounded-2xl border px-4 py-3.5 ${
                c.status === "in_use" ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-ink-900 truncate">{c.label}</div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    {c.status === "in_use" ? `Занят: ${c.currentOwnerLabel || "—"}` : "Свободен"}
                  </div>
                </div>
                {c.status === "free" ? (
                  <button
                    className="btn-secondary shrink-0"
                    disabled={busyId === c._id}
                    onClick={() => {
                      setGiving(c);
                      setOwnerLabel("");
                    }}
                  >
                    <PackageCheck className="h-3.5 w-3.5" strokeWidth={2.1} />
                    Выдать
                  </button>
                ) : (
                  <button className="btn-secondary shrink-0" disabled={busyId === c._id} onClick={() => free(c._id)}>
                    <PackageX className="h-3.5 w-3.5" strokeWidth={2.1} />
                    Освободить
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {giving && (
        <div className="modal-backdrop" onClick={() => setGiving(null)}>
          <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title mb-4">Выдать «{giving.label}» клиенту</h3>
            <input
              className="input mb-3"
              placeholder="ФИО/наименование клиента"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busyId === giving._id} onClick={give}>
                Выдать
              </button>
              <button className="btn-secondary" onClick={() => setGiving(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
