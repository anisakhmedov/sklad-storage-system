"use client";

import { useEffect, useState } from "react";
import { X, FileStack, ExternalLink } from "lucide-react";

interface ActRow {
  _id: string;
  actNumber: string;
  kind: string;
  itemLabel: string;
  changedQuantityText: string;
  totalQuantityText?: string;
  createdAt: string;
  createdBy: string;
}

const KIND_LABELS: Record<string, string> = {
  goods_given: "Акт приёма товара",
  goods_returned: "Акт сдачи товара",
  inventory_given: "Акт передачи инвентаря",
  inventory_returned: "Акт возврата инвентаря",
  box_given: "Акт передачи ящиков",
  box_returned: "Акт возврата ящиков",
};

/**
 * Список всех актов по записи и по клиенту+контейнеру (товарные + инвентарные + ящичные) —
 * кнопка "Акты" на app/dashboard/records/page.tsx. Данные — app/api/acts/route.ts, PDF —
 * app/api/acts/[id]/pdf/route.ts (сохранённый файл, открывается мгновенно).
 */
export default function ActsModal({
  recordId,
  ownerKey,
  containerId,
  onClose,
}: {
  recordId: string;
  ownerKey: string;
  containerId: string;
  onClose: () => void;
}) {
  const [acts, setActs] = useState<ActRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ recordId, ownerKey, containerId });
    fetch(`/api/acts?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setActs(d.acts || []))
      .finally(() => setLoading(false));
  }, [recordId, ownerKey, containerId]);

  return (
    <div className="modal-backdrop overflow-y-auto py-8" onClick={onClose}>
      <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <FileStack className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Все акты
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : acts.length === 0 ? (
          <div className="empty-state py-8">
            <p className="text-sm text-ink-500">По этой записи/клиенту пока нет актов.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto -mr-1 pr-1">
            {acts.map((a) => (
              <a
                key={a._id}
                href={`/api/acts/${a._id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink-800 truncate">
                    {KIND_LABELS[a.kind] || a.kind} · № {a.actNumber}
                  </div>
                  <div className="text-xs text-ink-400 truncate">
                    {a.itemLabel} — {a.changedQuantityText}
                    {a.totalQuantityText ? ` (итого: ${a.totalQuantityText})` : ""}
                  </div>
                  <div className="text-xs text-ink-400">
                    {new Date(a.createdAt).toLocaleString("ru-RU")} · {a.createdBy}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-ink-300 shrink-0" strokeWidth={2} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
