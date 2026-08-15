"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import { useI18n } from "./i18n";
import CellGrid, { CellGridCell } from "./CellGrid";
import { ArrowLeft, LayoutGrid, Lock, LockOpen } from "lucide-react";

interface Container {
  id: string;
  name: string;
  description?: string;
}

/**
 * Экран управления камерами: сотрудник выбирает контейнер, видит сетку 2×4 с числом
 * арендаторов в каждой камере и может отметить/снять флажок "заполнена"
 * (models/Container.ts::fullCells) — тот же флажок, что блокирует выбор камеры в
 * NewRecordWizard при размещении нового товара.
 */
export default function CellsScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [containers, setContainers] = useState<Container[]>([]);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [cells, setCells] = useState<CellGridCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [cellsLoading, setCellsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<CellGridCell | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []))
      .finally(() => setLoading(false));
  }, []);

  const loadCells = useCallback(
    async (id: string) => {
      setCellsLoading(true);
      setError(null);
      try {
        const res = await miniAppFetch(`/api/miniapp/containers/${id}/cells`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || t("cells.loadError"));
          return;
        }
        setCells(data.cells || []);
      } catch {
        setError(t("common.networkError"));
      } finally {
        setCellsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (containerId) loadCells(containerId);
  }, [containerId, loadCells]);

  async function toggleFull(full: boolean) {
    if (!containerId || !picked) return;
    setBusy(true);
    try {
      const res = await miniAppFetch(`/api/miniapp/containers/${containerId}/cells`, {
        method: "PATCH",
        body: JSON.stringify({ cellNumber: picked.number, full }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || t("cells.saveError"));
        return;
      }
      setPicked(null);
      await loadCells(containerId);
    } finally {
      setBusy(false);
    }
  }

  if (containerId) {
    const container = containers.find((c) => c.id === containerId);
    return (
      <div className="pt-4 pb-8">
        <div className="flex items-center gap-2 mb-5">
          <button
            className="btn-icon btn-ghost -ml-2"
            onClick={() => {
              setContainerId(null);
              setPicked(null);
            }}
            aria-label={t("common.back")}
          >
            <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
          </button>
          <h1 className="text-lg font-semibold text-ink-900 tracking-tight truncate">{container?.name}</h1>
        </div>

        {cellsLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <CellGrid
              cells={cells}
              onSelect={(n) => setPicked(cells.find((c) => c.number === n) || { number: n, occupants: [], isFull: false })}
              allowSelectFull
            />
            <p className="text-xs text-ink-400 mt-3 leading-relaxed">{t("cells.hint")}</p>
          </>
        )}

        {error && (
          <div className="alert-danger mt-3">
            <span>{error}</span>
          </div>
        )}

        {picked && (
          <div className="modal-backdrop" onClick={() => !busy && setPicked(null)}>
            <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h3 className="card-title mb-1">{t("cells.cellNumber", { n: picked.number })}</h3>
              <p className="text-sm text-ink-400 mb-4">
                {picked.occupants.length === 0
                  ? t("cells.empty")
                  : t("cells.occupantsCount", {
                      count: picked.occupants.length,
                      names: picked.occupants.map((o) => o.ownerLabel).join(", "),
                    })}
              </p>
              <div className="space-y-2">
                {picked.isFull ? (
                  <button className="btn-primary w-full py-3 rounded-2xl" disabled={busy} onClick={() => toggleFull(false)}>
                    <LockOpen className="h-4 w-4" strokeWidth={2.1} />
                    {t("cells.unmarkFull")}
                  </button>
                ) : (
                  <button className="btn-primary w-full py-3 rounded-2xl" disabled={busy} onClick={() => toggleFull(true)}>
                    <Lock className="h-4 w-4" strokeWidth={2.1} />
                    {t("cells.markFull")}
                  </button>
                )}
                <button className="btn-ghost w-full py-3 rounded-2xl" disabled={busy} onClick={() => setPicked(null)}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label={t("common.back")}>
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">{t("cells.title")}</h1>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : containers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <LayoutGrid className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-ink-500">{t("cells.noContainers")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {containers.map((c) => (
            <button
              key={c.id}
              onClick={() => setContainerId(c.id)}
              className="w-full text-left rounded-2xl border border-ink-200 bg-white px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              <div className="font-medium text-ink-900">{c.name}</div>
              {c.description && <div className="text-xs text-ink-400 mt-0.5">{c.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
