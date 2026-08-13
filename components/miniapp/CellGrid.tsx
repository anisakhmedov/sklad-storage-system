"use client";

import { Lock } from "lucide-react";

export interface CellGridCell {
  number: number;
  occupants: { ownerKey: string; ownerLabel: string; ownerType: "individual" | "company"; productSummary: string }[];
  isFull: boolean;
}

/**
 * Сетка камер хранения — количество камер редактируется индивидуально на контейнер (см.
 * models/Container.ts::cellCount, по умолчанию 8), поэтому рендерится ровно столько кнопок,
 * сколько элементов в `cells` (эта сетка приходит уже нужного размера с сервера, см.
 * lib/containerCells.ts::getCellsGrid). Используется и для выбора камеры при размещении товара
 * (components/miniapp/NewRecordWizard.tsx, onSelect + красные камеры недоступны), и для
 * управления флажком "заполнена" (components/miniapp/CellsScreen.tsx, allowSelectFull=true —
 * там как раз нужно тапать по красным, чтобы снять отметку).
 */
export default function CellGrid({
  cells,
  selected,
  onSelect,
  allowSelectFull = false,
}: {
  cells: CellGridCell[];
  selected?: number | null;
  onSelect?: (n: number) => void;
  allowSelectFull?: boolean;
}) {
  const sortedCells = [...cells].sort((a, b) => a.number - b.number);

  return (
    <div className="grid grid-cols-4 gap-2">
      {sortedCells.map((cell) => {
        const n = cell.number;
        const occupants = cell.occupants || [];
        const full = !!cell.isFull;
        const isSelected = selected === n;
        const clickable = !!onSelect && (!full || allowSelectFull);

        const tone = full
          ? "border-rose-300 bg-rose-50 text-rose-700"
          : occupants.length > 0
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-700";

        return (
          <button
            key={n}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onSelect!(n)}
            className={`relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-4 text-sm font-semibold transition-colors ${tone} ${
              isSelected ? "ring-2 ring-brand-600 ring-offset-1" : ""
            } ${clickable ? "active:scale-[0.97] cursor-pointer" : "cursor-not-allowed opacity-80"}`}
          >
            <span>{n}</span>
            {occupants.length > 0 && (
              <span className="text-[10px] font-normal leading-none">{occupants.length} чел.</span>
            )}
            {full && <Lock className="absolute top-1.5 right-1.5 h-3 w-3" strokeWidth={2.2} />}
          </button>
        );
      })}
    </div>
  );
}
