"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { UNIT_COLORS, UNIT_LABELS, METHOD_COLORS, CHART_CHROME } from "@/components/charts/colors";
import { BarChart3, PackageMinus, Layers3, AlertCircle, Table2 } from "lucide-react";
import CellSessionsReport from "@/components/dashboard/CellSessionsReport";

interface Summary {
  monthlyVolume: Array<Record<string, number | string>>;
  containerLoad: Array<Record<string, number | string>>;
  paymentsByMethod: Array<{ method: string; amount: number; count: number }>;
  containerBalances: Array<{
    containerId: string;
    name: string;
    balances: { tonne: number; kg: number; box: number; piece: number };
  }>;
}

const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const months = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const tooltipStyle = {
  contentStyle: {
    borderRadius: 12,
    border: `1px solid #e6e9ee`,
    boxShadow: "0 12px 40px -8px rgb(15 23 42 / 0.18)",
    fontSize: 12.5,
    padding: "8px 12px",
  },
  cursor: { fill: "rgb(56 104 245 / 0.05)" },
};

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">("");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"summary" | "cells">("summary");
  const [containers, setContainers] = useState<Array<{ _id: string; name: string }>>([]);
  const [cellsContainerId, setCellsContainerId] = useState("");

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (month) params.set("month", String(month));
    const res = await fetch(`/api/reports/summary?${params.toString()}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-7 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="section-eyebrow">Аналитика</p>
          <h1 className="section-title mt-1">Отчётность</h1>
        </div>
        <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1">
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "summary" ? "bg-brand-50 text-brand-700" : "text-ink-500"
            }`}
            onClick={() => setView("summary")}
          >
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={2} />
            Сводка
          </button>
          <button
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "cells" ? "bg-brand-50 text-brand-700" : "text-ink-500"
            }`}
            onClick={() => setView("cells")}
          >
            <Table2 className="h-3.5 w-3.5" strokeWidth={2} />
            Заполненность камер
          </button>
        </div>
      </div>

      {view === "cells" ? (
        <>
          <div className="card mb-6 max-w-xs">
            <label className="label">Контейнер</label>
            <select className="input" value={cellsContainerId} onChange={(e) => setCellsContainerId(e.target.value)}>
              <option value="">Все</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <CellSessionsReport containerId={cellsContainerId} />
        </>
      ) : (
        <>
      <div className="card mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">Год</label>
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Месяц</label>
          <select
            className="input"
            value={month}
            onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Весь год</option>
            {months.map((m, idx) => (
              <option key={m} value={idx + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-6">
          <div className="card h-80 skeleton" />
          <div className="card h-80 skeleton" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
                  Объём товара по месяцам
                </h2>
                <p className="card-subtitle max-w-xl">
                  Разные единицы измерения показаны отдельными рядами — суммировать между собой их
                  нельзя, сравнивайте значения внутри одного ряда.
                </p>
              </div>
            </div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={data.monthlyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="month" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={{ stroke: CHART_CHROME.grid }} tickLine={false} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend formatter={(v) => UNIT_LABELS[v] || v} wrapperStyle={{ fontSize: 12.5 }} />
                  {Object.keys(UNIT_COLORS).map((unit) => (
                    <Bar key={unit} dataKey={unit} name={unit} fill={UNIT_COLORS[unit]} radius={[4, 4, 0, 0]} maxBarSize={42} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title flex items-center gap-2">
                <Layers3 className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
                Загруженность по контейнерам
              </h2>
            </div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={data.containerLoad}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="container" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={{ stroke: CHART_CHROME.grid }} tickLine={false} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend formatter={(v) => UNIT_LABELS[v] || v} wrapperStyle={{ fontSize: 12.5 }} />
                  {Object.keys(UNIT_COLORS).map((unit) => (
                    <Bar key={unit} dataKey={unit} name={unit} fill={UNIT_COLORS[unit]} radius={[4, 4, 0, 0]} maxBarSize={42} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Суммы оплат по способам</h2>
            </div>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={data.paymentsByMethod}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="method" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={{ stroke: CHART_CHROME.grid }} tickLine={false} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => v.toLocaleString("ru-RU")} />
                  <Bar dataKey="amount" name="Сумма" radius={[4, 4, 0, 0]} maxBarSize={56}>
                    {data.paymentsByMethod.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLORS[entry.method] || "#3868f5"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <div className="card-header">
              <h2 className="card-title">Текущий остаток по контейнерам (приход − списание)</h2>
            </div>
            <table className="table-base">
              <thead>
                <tr>
                  <th>Контейнер</th>
                  <th>Тонны</th>
                  <th>Кг</th>
                  <th>Ящики</th>
                  <th>Штуки</th>
                </tr>
              </thead>
              <tbody>
                {data.containerBalances.map((c) => (
                  <tr key={c.containerId}>
                    <td className="font-medium text-ink-800">{c.name}</td>
                    <td className="tabular-nums">{c.balances.tonne}</td>
                    <td className="tabular-nums">{c.balances.kg}</td>
                    <td className="tabular-nums">{c.balances.box}</td>
                    <td className="tabular-nums">{c.balances.piece}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <WithdrawalForm onSaved={load} />
        </div>
      )}
        </>
      )}
    </div>
  );
}

function WithdrawalForm({ onSaved }: { onSaved: () => void }) {
  const [containers, setContainers] = useState<Array<{ _id: string; name: string }>>([]);
  const [containerId, setContainerId] = useState("");
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("tonne");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, productName, quantity, unit, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setProductName("");
      setQuantity("");
      setNote("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-xl">
      <div className="card-header">
        <h2 className="card-title flex items-center gap-2">
          <PackageMinus className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
          Списание / вывоз товара
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label">Контейнер</label>
          <select className="input" value={containerId} onChange={(e) => setContainerId(e.target.value)} required>
            <option value="">Выберите контейнер</option>
            {containers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Товар</label>
          <input className="input" value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="label">Количество</label>
            <input
              type="number"
              className="input"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <label className="label">Ед. изм.</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="tonne">тонны</option>
              <option value="kg">кг</option>
              <option value="box">ящики</option>
              <option value="piece">штуки</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Примечание</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && (
          <div className="alert-danger">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}
        <button className="btn-primary" disabled={busy}>
          Зафиксировать списание
        </button>
      </form>
    </div>
  );
}
