"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Download, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditLogRow {
  _id: string;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete";
  actorId: string;
  actorLabel: string;
  actorRole: "owner" | "trusted" | "employee" | "system";
  changes?: Record<string, unknown>;
  timestamp: string;
}

const ENTITIES = ["StorageRecord", "Employee", "WebAccess", "Container", "Income", "Withdrawal"];
const ACTIONS = ["create", "update", "delete"] as const;

const actionLabels: Record<string, string> = { create: "Создание", update: "Изменение", delete: "Удаление" };
const actionColors: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-amber-100 text-amber-700",
  delete: "bg-rose-100 text-rose-700",
};
const roleLabels: Record<string, string> = {
  owner: "Владелец",
  trusted: "Доверенное лицо",
  employee: "Сотрудник",
  system: "Система",
};

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/audit?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [page, entity, action, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function resetAndLoad() {
    setPage(1);
  }

  function exportCsv() {
    const header = ["Дата", "Сущность", "Действие", "Кто", "Роль", "Изменения"];
    const rows = logs.map((l) => [
      new Date(l.timestamp).toLocaleString("ru-RU"),
      l.entity,
      actionLabels[l.action] || l.action,
      l.actorLabel,
      roleLabels[l.actorRole] || l.actorRole,
      JSON.stringify(l.changes || {}),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Владелец / доверенные лица</p>
        <h1 className="section-title mt-1">Активность</h1>
        <p className="text-sm text-ink-400 mt-1">Полный журнал действий на сайте.</p>
      </div>

      <div className="card mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Сущность</label>
          <select
            className="input"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              resetAndLoad();
            }}
          >
            <option value="">Все</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Действие</label>
          <select
            className="input"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              resetAndLoad();
            }}
          >
            <option value="">Все</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabels[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">С даты</label>
          <input
            type="date"
            className="input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              resetAndLoad();
            }}
          />
        </div>
        <div>
          <label className="label">По дату</label>
          <input
            type="date"
            className="input"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              resetAndLoad();
            }}
          />
        </div>
        <button className="btn-secondary" onClick={exportCsv} disabled={logs.length === 0}>
          <Download className="h-4 w-4" strokeWidth={2.1} />
          Скачать CSV (страница)
        </button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <History className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Событий не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сущность</th>
                <th>Действие</th>
                <th>Кто</th>
                <th>Роль</th>
                <th>Изменения</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l._id}>
                  <td className="whitespace-nowrap text-ink-500">{new Date(l.timestamp).toLocaleString("ru-RU")}</td>
                  <td className="text-ink-800 font-medium">{l.entity}</td>
                  <td>
                    <span className={`badge ${actionColors[l.action]}`}>{actionLabels[l.action] || l.action}</span>
                  </td>
                  <td className="text-ink-800">{l.actorLabel}</td>
                  <td className="text-ink-500">{roleLabels[l.actorRole] || l.actorRole}</td>
                  <td className="max-w-sm truncate text-ink-400 text-xs" title={JSON.stringify(l.changes || {})}>
                    {JSON.stringify(l.changes || {})}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && logs.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink-400">
            Стр. {page} из {totalPages} · всего {total}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-icon btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Назад"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              className="btn-icon btn-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Вперёд"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
