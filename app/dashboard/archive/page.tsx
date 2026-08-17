"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Archive, UserRound, Building2, Boxes, Users } from "lucide-react";
import CellSessionsReport from "@/components/dashboard/CellSessionsReport";

interface TenantRow {
  clientId: string;
  ownerType: "individual" | "company";
  ownerLabel: string;
  phoneOrInn: string;
  containerCount: number;
  recordCount: number;
  totalAccrued: number;
  totalPaid: number;
  totalBalance: number;
  lastActivity: string;
  active: boolean;
}

interface ContainerRef {
  _id: string;
  name: string;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

/**
 * «Архив» — отдельная страница для истории тех, кого уже нет: арендаторы, у которых закрыты все
 * записи (см. lib/tenants.ts::TenantListItem.active), и закрытые сессии камер (камера была занята
 * и снова полностью опустела, см. lib/cellSessions.ts). Текущее/активное показывают другие
 * страницы («Арендаторы», «Отчётность → Заполненность камер») — здесь только то, что уже в
 * прошлом.
 */
export default function ArchivePage() {
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containerId, setContainerId] = useState("");
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  useEffect(() => {
    setTenantsLoading(true);
    const params = new URLSearchParams({ status: "archived" });
    if (containerId) params.set("containerId", containerId);
    fetch(`/api/tenants?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants || []))
      .finally(() => setTenantsLoading(false));
  }, [containerId]);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">История</p>
        <h1 className="section-title mt-1">Архив</h1>
        <p className="text-sm text-ink-400 mt-1">
          Съехавшие арендаторы и камеры, которые были заняты, а потом снова полностью опустели.
          Карточки, история и задолженность никуда не удаляются — их просто не видно среди
          текущих.
        </p>
      </div>

      <div className="card mb-6 max-w-xs">
        <label className="label">Контейнер</label>
        <select className="input" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
          <option value="">Все</option>
          {containers.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
          Съехавшие арендаторы
        </h2>
        <div className="card overflow-x-auto">
          {tenantsLoading ? (
            <div className="space-y-2.5 p-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-11 w-full" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Archive className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-sm text-ink-500">Пока никто не съехал.</p>
            </div>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Арендатор</th>
                  <th>Телефон / ИНН</th>
                  <th>Контейнеров</th>
                  <th>Начислено</th>
                  <th>Оплачено</th>
                  <th>Задолженность</th>
                  <th>Последняя активность</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const Icon = t.ownerType === "individual" ? UserRound : Building2;
                  return (
                    <tr key={t.clientId}>
                      <td>
                        <Link
                          href={`/dashboard/tenants/${encodeURIComponent(t.clientId)}`}
                          className="flex items-center gap-2.5 hover:text-brand-600"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                            <Icon className="h-4 w-4" strokeWidth={2} />
                          </div>
                          <span className="font-medium text-ink-800">{t.ownerLabel}</span>
                        </Link>
                      </td>
                      <td className="text-ink-500">{t.phoneOrInn}</td>
                      <td className="tabular-nums text-ink-500">
                        <span className="inline-flex items-center gap-1">
                          <Boxes className="h-3.5 w-3.5" strokeWidth={2} /> {t.containerCount}
                        </span>
                      </td>
                      <td className="tabular-nums text-ink-500">{money(t.totalAccrued)}</td>
                      <td className="tabular-nums text-ink-500">{money(t.totalPaid)}</td>
                      <td className={`tabular-nums font-medium ${t.totalBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {money(t.totalBalance)}
                      </td>
                      <td className="whitespace-nowrap text-ink-500">
                        {new Date(t.lastActivity).toLocaleDateString("ru-RU")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-ink-700 mb-3 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
          Закрытые сессии камер
        </h2>
        <CellSessionsReport containerId={containerId} onlyClosed />
      </div>
    </div>
  );
}
