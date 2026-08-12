"use client";

import { useEffect, useState } from "react";
import { Thermometer, Sun, Moon } from "lucide-react";

interface PatrolLogRow {
  _id: string;
  containerId: { _id: string; name: string } | string;
  employeeId: { _id: string; name: string } | string;
  period: "morning" | "evening";
  temperature: number;
  date: string;
  createdAt: string;
}

const PERIOD_LABELS: Record<string, string> = { morning: "Дневной", evening: "Вечерний" };

export default function PatrolsPage() {
  const [logs, setLogs] = useState<PatrolLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/patrols")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Обходы</h1>
        <p className="text-sm text-ink-400 mt-1">
          История обходов холодильных камер — температура, дважды в день.
        </p>
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
            <p className="text-sm text-ink-500">Обходов ещё не было.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Период</th>
                <th>Контейнер</th>
                <th>Температура</th>
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
                    <td className="tabular-nums font-medium text-ink-800">{l.temperature} °C</td>
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
