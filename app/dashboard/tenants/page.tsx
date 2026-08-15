"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserRound, Building2, Users, Boxes, Download, LayoutList, Table2 } from "lucide-react";
import TenantMatrixTable from "@/components/dashboard/TenantMatrixTable";

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
}

interface ContainerRef {
  _id: string;
  name: string;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [containerId, setContainerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "matrix">("matrix");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsOwner(d.user?.role === "owner"));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (containerId) params.set("containerId", containerId);
    fetch(`/api/tenants?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setTenants(d.tenants || []))
      .finally(() => setLoading(false));
  }, [containerId]);

  const filtered = tenants.filter(
    (t) =>
      t.ownerLabel.toLowerCase().includes(query.trim().toLowerCase()) ||
      t.phoneOrInn.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div>
      <div className="mb-7 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="section-eyebrow">Клиенты</p>
          <h1 className="section-title mt-1">Арендаторы</h1>
          <p className="text-sm text-ink-400 mt-1">
            Полная аналитика по каждому арендатору — онлайн и в Excel.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1">
            <button
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "list" ? "bg-brand-50 text-brand-700" : "text-ink-500"
              }`}
              onClick={() => setView("list")}
            >
              <LayoutList className="h-3.5 w-3.5" strokeWidth={2} />
              Список
            </button>
            <button
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                view === "matrix" ? "bg-brand-50 text-brand-700" : "text-ink-500"
              }`}
              onClick={() => setView("matrix")}
            >
              <Table2 className="h-3.5 w-3.5" strokeWidth={2} />
              Таблица по камерам
            </button>
          </div>
          <a href="/api/tenants/export" className="btn-primary">
            <Download className="h-4 w-4" strokeWidth={2.1} />
            Скачать всех (Excel)
          </a>
        </div>
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

      {view === "matrix" ? (
        <TenantMatrixTable isOwner={isOwner} containerId={containerId} />
      ) : (
        <>
      <div className="card mb-6 max-w-md">
        <input
          className="input"
          placeholder="Поиск по имени, телефону или ИНН"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">{tenants.length === 0 ? "Арендаторов пока нет." : "Ничего не найдено."}</p>
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
              {filtered.map((t) => {
                const Icon = t.ownerType === "individual" ? UserRound : Building2;
                return (
                  <tr key={t.clientId}>
                    <td>
                      <Link
                        href={`/dashboard/tenants/${encodeURIComponent(t.clientId)}`}
                        className="flex items-center gap-2.5 hover:text-brand-600"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
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
        </>
      )}
    </div>
  );
}
