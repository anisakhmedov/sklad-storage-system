"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CELL_NUMBERS } from "@/lib/cells";
import { Boxes, Lock, X } from "lucide-react";

interface CellOccupant {
  ownerKey: string;
  ownerLabel: string;
  ownerType: "individual" | "company";
  productSummary: string;
}
interface CellStatus {
  number: number;
  occupants: CellOccupant[];
  isFull: boolean;
}
interface ContainerGrid {
  containerId: string;
  containerName: string;
  cells: CellStatus[];
}

/**
 * Сетка камер хранения (2×4 на контейнер, см. lib/cells.ts) для владельца — переиспользуется
 * и на /dashboard (обзор), и на /dashboard/containers ("та же самая картина", по просьбе
 * владельца). Зелёная камера — свободна, красная — есть арендаторы (буквально то, что просил
 * владелец); флажок "заполнена", который сотрудник ставит в мини-аппе (см.
 * models/Container.ts::fullCells), показан отдельным значком поверх, а не третьим цветом.
 */
export default function ContainerCellsGrid() {
  const [grids, setGrids] = useState<ContainerGrid[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalFor, setModalFor] = useState<{ container: ContainerGrid; cell: CellStatus } | null>(null);

  useEffect(() => {
    fetch("/api/containers/cells")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(data.error || "Не удалось загрузить камеры");
          return;
        }
        setGrids(data.containers || []);
      })
      .catch(() => setError("Не удалось связаться с сервером"));
  }, []);

  if (error) {
    return <div className="alert-danger mt-6">{error}</div>;
  }

  if (!grids) {
    return (
      <div className="card mt-6">
        <div className="grid grid-cols-4 gap-2 max-w-md">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (grids.length === 0) {
    return (
      <div className="card mt-6 empty-state">
        <div className="empty-state-icon">
          <Boxes className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-sm text-ink-500">Контейнеров пока нет.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {grids.map((g) => (
          <div key={g.containerId} className="card">
            <div className="card-header">
              <h3 className="card-title flex items-center gap-2">
                <Boxes className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
                {g.containerName}
              </h3>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {CELL_NUMBERS.map((n) => {
                const cell = g.cells.find((c) => c.number === n) || { number: n, occupants: [], isFull: false };
                const occupied = cell.occupants.length > 0;
                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!occupied}
                    onClick={() => occupied && setModalFor({ container: g, cell })}
                    title={occupied ? "Показать арендаторов" : "Свободно"}
                    className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3.5 text-sm font-semibold transition-colors ${
                      occupied
                        ? "border-rose-300 bg-rose-50 text-rose-700 cursor-pointer hover:bg-rose-100"
                        : "border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default"
                    }`}
                  >
                    <span>{n}</span>
                    {occupied && <span className="text-[10px] font-normal leading-none">{cell.occupants.length} чел.</span>}
                    {cell.isFull && <Lock className="absolute top-1 right-1 h-3 w-3" strokeWidth={2.2} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {modalFor && (
        <div className="modal-backdrop" onClick={() => setModalFor(null)}>
          <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="card-title">
                {modalFor.container.containerName} · камера №{modalFor.cell.number}
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setModalFor(null)} aria-label="Закрыть">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            {modalFor.cell.isFull && (
              <p className="text-xs text-rose-600 mb-3 flex items-center gap-1">
                <Lock className="h-3 w-3" strokeWidth={2.2} /> Отмечена сотрудником как заполненная
              </p>
            )}
            <div className="space-y-2 mt-3">
              {modalFor.cell.occupants.map((o) => (
                <Link
                  key={o.ownerKey}
                  href={`/dashboard/tenants/${encodeURIComponent(o.ownerKey)}`}
                  className="block rounded-xl border border-ink-200 px-3.5 py-2.5 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                >
                  <div className="font-medium text-ink-900">{o.ownerLabel}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{o.productSummary || "—"}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
