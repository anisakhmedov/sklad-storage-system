"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";
import { useI18n } from "./i18n";
import { ArrowLeft, MinusCircle, CheckCircle2 } from "lucide-react";

type ExpenseType = "owner_withdrawal" | "salary" | "other";
// "terminal" убран по решению владельца — расходы принимают только эти три способа
// (см. lib/validation.ts::expensePaymentMethodEnum).
type Method = "cash" | "transfer" | "card";

/**
 * Заявка сотрудника на расход (см. app/api/miniapp/expenses/route.ts) — всегда уходит владельцу
 * «на одобрение» и не меняет остаток на веб-панели, пока не подтверждена (см. lib/finance.ts).
 */
export default function ExpensesScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [type, setType] = useState<ExpenseType>("other");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [employeeName, setEmployeeName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const TYPE_LABELS: Record<ExpenseType, string> = {
    owner_withdrawal: t("expenses.typeOwnerWithdrawal"),
    salary: t("expenses.typeSalary"),
    other: t("expenses.typeOther"),
  };
  const METHOD_LABELS: Record<Method, string> = {
    cash: t("method.cash"),
    transfer: t("expenses.methodTransfer"),
    card: t("expenses.methodCard"),
  };

  async function handleSubmit() {
    if (!amount || Number(amount) <= 0) {
      setError(t("expenses.amountRequired"));
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
        setError(data.error || t("expenses.saveError"));
        return;
      }
      setDone(true);
    } catch {
      setError(t("common.networkError"));
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
        <h1 className="text-lg font-semibold text-ink-900 mt-3 mb-1">{t("expenses.doneTitle")}</h1>
        <p className="text-sm text-ink-400 leading-relaxed mb-6">{t("expenses.doneText")}</p>
        <button className="btn-primary w-full" onClick={onExit}>
          {t("common.done")}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-8">
      <div className="flex items-center gap-2 mb-5">
        <button className="btn-icon btn-ghost -ml-2" onClick={onExit} aria-label={t("common.back")}>
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <h1 className="text-lg font-semibold text-ink-900 tracking-tight">{t("expenses.title")}</h1>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">{t("expenses.typeLabel")}</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as ExpenseType)}>
            {(Object.keys(TYPE_LABELS) as ExpenseType[]).map((tp) => (
              <option key={tp} value={tp}>
                {TYPE_LABELS[tp]}
              </option>
            ))}
          </select>
        </div>

        {type === "salary" && (
          <div>
            <label className="label">{t("expenses.whomLabel")}</label>
            <input className="input" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
          </div>
        )}

        <div>
          <label className="label">{t("expenses.amountLabel")}</label>
          <input
            type="number"
            inputMode="decimal"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="label">{t("expenses.methodLabel")}</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">{t("expenses.noteLabel")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <button className="btn-primary w-full" disabled={busy} onClick={handleSubmit}>
          <MinusCircle className="h-4 w-4" strokeWidth={2.1} />
          {busy ? t("common.sending") : t("expenses.submit")}
        </button>
      </div>
    </div>
  );
}
