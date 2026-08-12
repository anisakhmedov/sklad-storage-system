"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";
import { ArrowLeft, MinusCircle, CheckCircle2 } from "lucide-react";

type ExpenseType = "owner_withdrawal" | "salary" | "other";
// "terminal" убран по решению владельца — расходы принимают только эти три способа
// (см. lib/validation.ts::expensePaymentMethodEnum).
type Method = "cash" | "transfer" | "card";

const TYPE_LABELS: Record<ExpenseType, string> = {
  owner_withdrawal: "Снятие для владельца",
  salary: "Зарплата сотруднику",
  other: "Прочее",
};
const METHOD_LABELS: Record<Method, string> = {
  cash: "Наличные",
  transfer: "Перечисление (счёт-банк)",
  card: "Карта (счёт-карта)",
};

/**
 * Заявка сотрудника на расход (см. app/api/miniapp/expenses/route.ts) — всегда уходит владельцу
 * «на одобрение» и не меняет остаток на веб-панели, пока не подтверждена (см. lib/finance.ts).
 */
export default function ExpensesScreen({ onExit }: { onExit: () => void }) {
  const [type, setType] = useState<ExpenseType>("other");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [employeeName, setEmployeeName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      setError("Укажите сумму");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/expenses", {
        method: "POST",
        body: JSON.stringify({ type, amount, method, employeeName, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setDone(true);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="pt-16 text-center px-4">
        <div className="empty-state-icon bg-emerald-100 text-emerald-600 mx-auto">
          <CheckCircle2 className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <h1 className="text-lg font-semibold text-ink-900 mt-3 mb-1">Заявка отправлена</h1>
        <p className="text-sm text-ink-400 leading-relaxed mb-6">
          Расход отправлен владельцу на одобрение и появится в остатке только после подтверждения.
        </p>
        <button className="btn-primary w-full" onClick={onExit}>
          Готово
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">Расход</h1>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">Тип</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ExpenseType)}>
            {(Object.keys(TYPE_LABELS) as ExpenseType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {type === "salary" && (
          <div>
            <label className="label">Кому (имя сотрудника)</label>
            <input className="input" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
          </div>
        )}

        <div>
          <label className="label">Сумма, сум</label>
          <input
            type="number"
            inputMode="decimal"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Способ оплаты</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Примечание</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy} onClick={handleSubmit}>
          <MinusCircle className="h-4 w-4" strokeWidth={2.1} />
          {busy ? "Отправка…" : "Отправить на одобрение"}
        </button>
      </div>
    </div>
  );
}
