"use client";

import { useEffect, useState } from "react";
import { miniAppFetch, haptic } from "./telegram";
import { useI18n } from "./i18n";
import MiniAppHeader from "./MiniAppHeader";
import ClientDetail from "./ClientDetail";
import CellGrid, { CellGridCell } from "./CellGrid";
import { LayoutGrid, UserRound, Building2, ChevronRight, Users } from "lucide-react";

type OwnerType = "individual" | "company";

interface ContainerRef {
  id: string;
  name: string;
}

interface Occupant {
  clientId: string;
  ownerLabel: string;
  ownerType: OwnerType;
  productSummary: string;
}

/**
 * Раньше это была продажа/списание общего складского инвентаря (безотносительно клиента) —
 * упразднено по решению владельца в пользу того, что реально нужно каждый день: быстро найти
 * конкретного клиента по контейнеру и камере, где физически лежит его груз, и оттуда
 * выдать/принять инвентарь или оформить выдачу товара после хранения. Навигация: контейнер →
 * камера → клиент → карточка клиента (components/miniapp/ClientDetail.tsx — там уже есть все
 * три действия: «Инвентарь на руках» выдать/принять и +/- количества товара с закрытием
 * записи). Список камер и арендаторов в них — тот же эндпоинт и тот же CellGrid, что и на
 * экране "Камеры контейнеров" (components/miniapp/CellsScreen.tsx), просто с другой целью тапа
 * по камере: тут не отмечаем "заполнена", а смотрим, кто в ней лежит.
 */
export default function InventoryDisposalsScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containersLoading, setContainersLoading] = useState(true);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [cells, setCells] = useState<CellGridCell[]>([]);
  const [cellsLoading, setCellsLoading] = useState(false);
  const [cellNumber, setCellNumber] = useState<number | null>(null);
  const [owner, setOwner] = useState<{ clientId: string; ownerLabel: string; ownerType: OwnerType } | null>(null);

  useEffect(() => {
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []))
      .finally(() => setContainersLoading(false));
  }, []);

  useEffect(() => {
    if (!containerId) {
      setCells([]);
      return;
    }
    setCellsLoading(true);
    miniAppFetch(`/api/miniapp/containers/${containerId}/cells`)
      .then((r) => r.json())
      .then((d) => setCells(d.cells || []))
      .finally(() => setCellsLoading(false));
  }, [containerId]);

  // Карточка клиента сама владеет кнопкой "Назад" (через собственный MiniAppHeader) — конфликта
  // с шапками ниже нет, т.к. при выбранном owner этот компонент рендерит только ClientDetail.
  if (owner) {
    return <ClientDetail owner={owner} onBack={() => setOwner(null)} />;
  }

  // Шаг 3: люди в выбранной камере.
  if (containerId && cellNumber !== null) {
    const occupants = cells.find((c) => c.number === cellNumber)?.occupants || [];
    return (
      <div className="pt-4 pb-8">
        <MiniAppHeader title={t("disposals.cellTitle", { n: cellNumber })} onBack={() => setCellNumber(null)} />
        {occupants.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">{t("disposals.noPeopleInCell")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {occupants.map((o) => {
              const Icon = o.ownerType === "individual" ? UserRound : Building2;
              return (
                <button
                  key={o.clientId}
                  onClick={() => {
                    haptic.selection();
                    setOwner(o);
                  }}
                  className="w-full flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2.1} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink-900 truncate">{o.ownerLabel}</div>
                    <div className="text-xs text-ink-400 truncate">{o.productSummary}</div>
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

  // Шаг 2: камеры выбранного контейнера.
  if (containerId) {
    const container = containers.find((c) => c.id === containerId);
    return (
      <div className="pt-4 pb-8">
        <MiniAppHeader title={container?.name} truncate onBack={() => setContainerId(null)} />
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
              onSelect={(n) => {
                haptic.selection();
                setCellNumber(n);
              }}
              allowSelectFull
            />
            <p className="text-xs text-ink-400 mt-3 leading-relaxed">{t("disposals.chooseCellHint")}</p>
          </>
        )}
      </div>
    );
  }

  // Шаг 1: контейнеры.
  return (
    <div className="pt-4 pb-8">
      <MiniAppHeader title={t("disposals.title")} onBack={onExit} />
      {containersLoading ? (
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
              onClick={() => {
                haptic.selection();
                setContainerId(c.id);
              }}
              className="w-full flex items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
            >
              <span className="font-medium text-ink-900">{c.name}</span>
              <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
