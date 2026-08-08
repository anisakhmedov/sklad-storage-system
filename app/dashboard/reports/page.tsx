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

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState<number | "">("");
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

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
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Отчётность</h1>

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
        <p className="text-sm text-slate-500">Загрузка…</p>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-medium text-slate-700 mb-1">Объём товара по месяцам</h2>
            <p className="text-xs text-slate-400 mb-3">
              Разные единицы измерения показаны отдельными рядами — суммировать между собой их
              нельзя, сравнивайте значения внутри одного ряда.
            </p>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={data.monthlyVolume}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="month" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend formatter={(v) => UNIT_LABELS[v] || v} />
                  {Object.keys(UNIT_COLORS).map((unit) => (
                    <Bar key={unit} dataKey={unit} name={unit} fill={UNIT_COLORS[unit]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-medium text-slate-700 mb-3">Загруженность по контейнерам</h2>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={data.containerLoad}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="container" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend formatter={(v) => UNIT_LABELS[v] || v} />
                  {Object.keys(UNIT_COLORS).map((unit) => (
                    <Bar key={unit} dataKey={unit} name={unit} fill={UNIT_COLORS[unit]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h2 className="text-lg font-medium text-slate-700 mb-3">Суммы оплат по способам</h2>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={data.paymentsByMethod}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_CHROME.grid} vertical={false} />
                  <XAxis dataKey="method" stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <YAxis stroke={CHART_CHROME.axis} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => v.toLocaleString("ru-RU")} />
                  <Bar dataKey="amount" name="Сумма" radius={[4, 4, 0, 0]}>
                    {data.paymentsByMethod.map((entry) => (
                      <Cell key={entry.method} fill={METHOD_COLORS[entry.method] || "#2a78d6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="text-lg font-medium text-slate-700 mb-3">
              Текущий остаток по контейнерам (приход − списание)
            </h2>
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
                    <td>{c.name}</td>
                    <td>{c.balances.tonne}</td>
                    <td>{c.balances.kg}</td>
                    <td>{c.balances.box}</td>
                    <td>{c.balances.piece}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <WithdrawalForm onSaved={load} />
        </div>
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
      <h2 className="text-lg font-medium text-slate-700 mb-3">Списание / вывоз товара</h2>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary" disabled={busy}>
          Зафиксировать списание
        </button>
      </form>
    </div>
  );
}
