"use client";

import { useCallback, useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import { CELL_NUMBERS } from "@/lib/cells";
import { ArrowLeft, Thermometer, Zap, Sun, Moon, CheckCircle2, TriangleAlert, ChevronRight } from "lucide-react";

type Period = "morning" | "evening";

interface CellStatus {
  number: number;
  morningDone: boolean;
  eveningDone: boolean;
}

interface StatusRow {
  containerId: string;
  containerName: string;
  cells: CellStatus[];
  morningDone: boolean;
  eveningDone: boolean;
}

// Дублирует lib/patrols.ts::isPatrolWindowPassed (тот файл серверный, тянет mongoose —
// не годится для импорта в клиентский компонент) — окна те же: 8–10 и 18–20 по Ташкенту.
const WINDOWS: Record<Period, { endHour: number }> = { morning: { endHour: 10 }, evening: { endHour: 20 } };
function isWindowPassed(period: Period): boolean {
  const tashkentHour = new Date(Date.now() + 5 * 60 * 60 * 1000).getUTCHours();
  return tashkentHour >= WINDOWS[period].endHour;
}

const PERIOD_LABELS: Record<Period, string> = { morning: "Обход дневной", evening: "Обход вечерний" };
const PERIOD_WINDOW_TEXT: Record<Period, string> = { morning: "≈ 8:00–10:00", evening: "≈ 18:00–20:00" };

export default function PatrolScreen({ onExit }: { onExit: () => void }) {
  const [status, setStatus] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/patrols");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось загрузить статус обхода");
        return;
      }
      setStatus(data.status || []);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (period) {
    return <PeriodChecklist period={period} rows={status} onBack={() => setPeriod(null)} onChanged={load} />;
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">Обход</h1>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="skeleton h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <div className="empty-state-icon bg-rose-100 text-rose-600">
            <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(["morning", "evening"] as Period[]).map((p) => {
            const allDone = status.length > 0 && status.every((s) => (p === "morning" ? s.morningDone : s.eveningDone));
            const overdue = !allDone && isWindowPassed(p);
            const Icon = p === "morning" ? Sun : Moon;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`w-full flex items-center gap-3.5 rounded-2xl border px-4 py-4 text-left transition-colors active:scale-[0.99] ${
                  overdue
                    ? "border-rose-300 bg-rose-50"
                    : allDone
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-ink-200 bg-white hover:border-brand-300"
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    overdue ? "bg-rose-100 text-rose-600" : allDone ? "bg-emerald-100 text-emerald-600" : "bg-brand-50 text-brand-600"
                  }`}
                >
                  {allDone ? <CheckCircle2 className="h-5 w-5" strokeWidth={2.1} /> : <Icon className="h-5 w-5" strokeWidth={2.1} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${overdue ? "text-rose-700" : "text-ink-900"}`}>{PERIOD_LABELS[p]}</div>
                  <div className={`text-xs mt-0.5 ${overdue ? "text-rose-500" : "text-ink-400"}`}>
                    {allDone ? "Сделано" : overdue ? `Просрочено · окно ${PERIOD_WINDOW_TEXT[p]}` : `Окно ${PERIOD_WINDOW_TEXT[p]}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeriodChecklist({
  period,
  rows,
  onBack,
  onChanged,
}: {
  period: Period;
  rows: StatusRow[];
  onBack: () => void;
  onChanged: () => void;
}) {
  const [containerId, setContainerId] = useState<string | null>(null);
  const container = rows.find((r) => r.containerId === containerId) || null;

  if (container) {
    return (
      <ContainerCellsPatrol
        period={period}
        row={container}
        onBack={() => setContainerId(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">{PERIOD_LABELS[period]}</h1>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm text-ink-500">Нет доступных контейнеров.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const doneCount = r.cells.filter((c) => (period === "morning" ? c.morningDone : c.eveningDone)).length;
            const allDone = doneCount === r.cells.length;
            return (
              <button
                key={r.containerId}
                onClick={() => setContainerId(r.containerId)}
                className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                  allDone ? "border-emerald-200 bg-emerald-50/60" : "border-ink-200 bg-white hover:border-brand-300"
                }`}
              >
                <div>
                  <div className="font-medium text-ink-900">{r.containerName}</div>
                  <div className={`text-xs mt-0.5 ${allDone ? "text-emerald-600" : "text-ink-400"}`}>
                    {allDone ? "Все камеры сделаны" : `Камер сделано: ${doneCount}/${r.cells.length}`}
                  </div>
                </div>
                <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContainerCellsPatrol({
  period,
  row,
  onBack,
  onChanged,
}: {
  period: Period;
  row: StatusRow;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const byNumber = new Map(row.cells.map((c) => [c.number, c]));

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight truncate">{row.containerName}</h1>
      </div>

      <p className="text-xs text-ink-400 mb-3">Нажмите на камеру, чтобы внести температуру и ампер.</p>

      <div className="grid grid-cols-4 gap-2">
        {CELL_NUMBERS.map((n) => {
          const cell = byNumber.get(n);
          const done = cell ? (period === "morning" ? cell.morningDone : cell.eveningDone) : false;
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPicked(n)}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-4 text-sm font-semibold transition-colors active:scale-[0.97] ${
                done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-ink-200 bg-white text-ink-700 hover:border-brand-300"
              }`}
            >
              <span>{n}</span>
              {done && <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.1} />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <CellPatrolModal
          period={period}
          containerId={row.containerId}
          cellNumber={picked}
          onClose={() => setPicked(null)}
          onSaved={() => {
            setPicked(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function CellPatrolModal({
  period,
  containerId,
  cellNumber,
  onClose,
  onSaved,
}: {
  period: Period;
  containerId: string;
  cellNumber: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [temperature, setTemperature] = useState("");
  const [amperage, setAmperage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!temperature || Number.isNaN(Number(temperature))) {
      setError("Укажите температуру");
      return;
    }
    if (!amperage || Number.isNaN(Number(amperage))) {
      setError("Укажите силу тока (ампер)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/patrols", {
        method: "POST",
        body: JSON.stringify({ containerId, cellNumber, period, temperature, amperage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      onSaved();
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-title mb-4">Камера №{cellNumber}</h3>
        <div className="space-y-3">
          <div className="input-icon-wrap">
            <Thermometer className="input-icon h-4 w-4" strokeWidth={2} />
            <input
              type="number"
              step="any"
              className="input"
              placeholder="Температура, °C"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="input-icon-wrap">
            <Zap className="input-icon h-4 w-4" strokeWidth={2} />
            <input
              type="number"
              step="any"
              className="input"
              placeholder="Ампер"
              value={amperage}
              onChange={(e) => setAmperage(e.target.value)}
              disabled={busy}
            />
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" disabled={busy} onClick={submit}>
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={onClose}>
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
