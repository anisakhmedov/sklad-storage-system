"use client";

import { useEffect, useState, useCallback } from "react";
import { Thermometer, Sun, Moon } from "lucide-react";

interface PatrolLogRow {
  _id: string;
  containerId: { _id: string; name: string } | string;
  cellNumber?: number;
  employeeId: { _id: string; name: string } | string;
  period: "morning" | "evening";
  temperature: number;
  amperage?: number;
  date: string;
  createdAt: string;
}

interface ContainerRef {
  _id: string;
  name: string;
}

const PERIOD_LABELS: Record<string, string> = { morning: "Дневной", evening: "Вечерний" };

export default function PatrolsPage() {
  const [logs, setLogs] = useState<PatrolLogRow[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    containerId: "",
    cellNumber: "",
    period: "",
    from: "",
    to: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.containerId) params.set("containerId", filters.containerId);
    if (filters.cellNumber) params.set("cellNumber", filters.cellNumber);
    if (filters.period) params.set("period", filters.period);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const res = await fetch(`/api/patrols?${params.toString()}`);
    const data = await res.json();
    setLogs(data.logs || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">
          Обходы <span className="text-ink-300 font-normal">· {total}</span>
        </h1>
        <p className="text-sm text-ink-400 mt-1">
          История обходов холодильных камер — температура и сила тока (ампер) по каждой камере, дважды в день.
        </p>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">Контейнер</label>
            <select
              className="input"
              value={filters.containerId}
              onChange={(e) => setFilters({ ...filters, containerId: e.target.value })}
            >
              <option value="">Все</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Камера</label>
            <select
              className="input"
              value={filters.cellNumber}
              onChange={(e) => setFilters({ ...filters, cellNumber: e.target.value })}
            >
              <option value="">Все</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  Камера {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Период</label>
            <select
              className="input"
              value={filters.period}
              onChange={(e) => setFilters({ ...filters, period: e.target.value })}
            >
              <option value="">Все</option>
              <option value="morning">Дневной</option>
              <option value="evening">Вечерний</option>
            </select>
          </div>
          <div>
            <label className="label">С даты</label>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label">По дату</label>
            <input
              type="date"
              className="input"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Thermometer className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Обходов не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Период</th>
                <th>Контейнер</th>
                <th>Камера</th>
                <th>Температура</th>
                <th>Ампер</th>
                <th>Сотрудник</th>
                <th>Отметка времени</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => {
                const Icon = l.period === "morning" ? Sun : Moon;
                return (
                  <tr key={l._id}>
                    <td className="whitespace-nowrap text-ink-500">{l.date}</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-ink-600">
                        <Icon className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
                        {PERIOD_LABELS[l.period] || l.period}
                      </span>
                    </td>
                    <td className="text-ink-800">
                      {typeof l.containerId === "object" ? l.containerId.name : l.containerId}
                    </td>
                    <td className="text-ink-600">{l.cellNumber ?? "—"}</td>
                    <td className="tabular-nums font-medium text-ink-800">{l.temperature} °C</td>
                    <td className="tabular-nums text-ink-600">{l.amperage != null ? `${l.amperage} А` : "—"}</td>
                    <td className="text-ink-500">
                      {typeof l.employeeId === "object" ? l.employeeId.name : "—"}
                    </td>
                    <td className="whitespace-nowrap text-ink-400 text-xs">
                      {new Date(l.createdAt).toLocaleString("ru-RU")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
