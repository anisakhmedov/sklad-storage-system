"use client";

import { useEffect, useMemo, useState } from "react";
import { miniAppFetch } from "./telegram";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  UserRound,
  Building2,
  Boxes,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Wallet,
  ClipboardCheck,
} from "lucide-react";

type OwnerType = "individual" | "company";
type Method = "cash" | "terminal" | "transfer";

interface OwnerContainerDebt {
  ownerType: OwnerType;
  ownerKey: string;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  accrued: number;
  paid: number;
  balance: number;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

const METHODS: Array<{ value: Method; icon: typeof Banknote }> = [
  { value: "cash", icon: Banknote },
  { value: "terminal", icon: CreditCard },
  { value: "transfer", icon: ArrowLeftRight },
];

const STEP_LABELS = ["Владелец", "Контейнер", "Оплата", "Проверка"];
const STEP_ICONS = [UserRound, Boxes, Wallet, ClipboardCheck];

export default function AddIncomeWizard({ onExit }: { onExit: () => void }) {
  const [debts, setDebts] = useState<OwnerContainerDebt[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(true);
  const [step, setStep] = useState(0);
  const [ownerKey, setOwnerKey] = useState("");
  const [containerId, setContainerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);

  useEffect(() => {
    miniAppFetch("/api/miniapp/debts")
      .then((r) => r.json())
      .then((d) => setDebts(d.debts || []))
      .finally(() => setLoadingDebts(false));
  }, []);

  const owners = useMemo(() => {
    const map = new Map<string, { ownerKey: string; ownerType: OwnerType; ownerLabel: string }>();
    for (const d of debts) {
      if (!map.has(d.ownerKey)) {
        map.set(d.ownerKey, { ownerKey: d.ownerKey, ownerType: d.ownerType, ownerLabel: d.ownerLabel });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [debts]);

  const containersForOwner = useMemo(
    () => debts.filter((d) => d.ownerKey === ownerKey),
    [debts, ownerKey]
  );

  const selectedOwner = owners.find((o) => o.ownerKey === ownerKey);
  const selectedDebt = containersForOwner.find((d) => d.containerId === containerId);

  function next() {
    setError(null);
    if (step === 0 && !ownerKey) return setError("Выберите владельца груза");
    if (step === 1 && !containerId) return setError("Выберите контейнер");
    if (step === 2 && !amount) return setError("Укажите сумму оплаты");
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    if (!selectedOwner) return;
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/income", {
        method: "POST",
        body: JSON.stringify({
          ownerType: selectedOwner.ownerType,
          ownerKey: selectedOwner.ownerKey,
          ownerLabel: selectedOwner.ownerLabel,
          containerId,
          amount,
          method,
          paidAt,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setSavedScreen(true);
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    setOwnerKey("");
    setContainerId("");
    setAmount("");
    setMethod("cash");
    setPaidAt(todayInput());
    setNote("");
    setStep(0);
    setSavedScreen(false);
  }

  if (savedScreen) {
    return (
      <div className="pt-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h1 className="text-lg font-semibold text-ink-900 mb-2">Оплата записана</h1>
        <p className="text-sm text-ink-400 mb-6">Хотите добавить ещё один платёж?</p>
        <div className="space-y-2">
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={startAnother}>
            Да, добавить ещё
          </button>
          <button className="btn-ghost w-full py-3 rounded-2xl" onClick={onExit}>
            Нет, завершить
          </button>
        </div>
      </div>
    );
  }

  const StepIcon = STEP_ICONS[step];

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <button className="btn-icon btn-ghost -ml-2" onClick={step === 0 ? onExit : back} aria-label="Назад">
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <span className="text-xs font-medium text-ink-400">
          Шаг {step + 1} из {STEP_LABELS.length}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-5">
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand-600" : "bg-ink-200"}`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
          <StepIcon className="h-4 w-4" strokeWidth={2.1} />
        </div>
        <h2 className="text-base font-semibold text-ink-900">{STEP_LABELS[step]}</h2>
      </div>

      {step === 0 && (
        <div className="space-y-2">
          {loadingDebts ? (
            <div className="space-y-2.5">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : owners.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <UserRound className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-sm text-ink-500">Пока нет ни одной записи о размещении товара.</p>
            </div>
          ) : (
            owners.map((o) => (
              <button
                key={o.ownerKey}
                onClick={() => {
                  setOwnerKey(o.ownerKey);
                  setContainerId("");
                }}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                  ownerKey === o.ownerKey ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                      {o.ownerType === "individual" ? (
                        <UserRound className="h-4 w-4" strokeWidth={2} />
                      ) : (
                        <Building2 className="h-4 w-4" strokeWidth={2} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900 truncate">{o.ownerLabel}</div>
                      <div className="text-xs text-ink-400">{o.ownerType === "individual" ? "физ. лицо" : "юр. лицо"}</div>
                    </div>
                  </div>
                  {ownerKey === o.ownerKey && <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-2">
          {containersForOwner.map((d) => (
            <button
              key={d.containerId}
              onClick={() => setContainerId(d.containerId)}
              className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                containerId === d.containerId ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink-900">{d.containerName}</div>
                  <div className="text-xs mt-0.5">
                    {d.balance > 0 ? (
                      <span className="text-rose-600">долг {money(d.balance)} сум</span>
                    ) : (
                      <span className="text-emerald-600">задолженности нет</span>
                    )}
                  </div>
                </div>
                {containerId === d.containerId && <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />}
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {selectedDebt && (
            <p className="text-xs text-ink-500 bg-ink-50 rounded-xl px-3.5 py-2.5 leading-relaxed">
              Начислено {money(selectedDebt.accrued)} сум, оплачено {money(selectedDebt.paid)} сум —{" "}
              {selectedDebt.balance > 0 ? (
                <span className="text-rose-600 font-medium">долг {money(selectedDebt.balance)} сум</span>
              ) : (
                <span className="text-emerald-600 font-medium">задолженности нет</span>
              )}
              .
            </p>
          )}
          <div>
            <label className="label">Сумма, сум</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Способ оплаты</label>
            <div className="flex gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`flex-1 flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                    method === m.value ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-500"
                  }`}
                >
                  <m.icon className="h-4 w-4" strokeWidth={2} />
                  {PAYMENT_METHOD_LABELS[m.value]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Дата оплаты</label>
            <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label className="label">Примечание</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-0 text-sm">
          <Row label="Владелец" value={selectedOwner?.ownerLabel} />
          <Row label="Контейнер" value={selectedDebt?.containerName} />
          <Row label="Сумма" value={`${money(Number(amount) || 0)} сум`} />
          <Row label="Способ оплаты" value={PAYMENT_METHOD_LABELS[method]} />
          <Row label="Дата" value={new Date(paidAt).toLocaleDateString("ru-RU")} />
          <Row label="Примечание" value={note || "—"} last />
        </div>
      )}

      {error && <div className="alert-danger mt-3">{error}</div>}

      <div className="mt-6">
        {step < STEP_LABELS.length - 1 ? (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={next}>
            Далее
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={handleSubmit} disabled={busy}>
            {busy ? "Сохранение…" : "Записать оплату"}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${last ? "" : "border-b border-ink-100"}`}>
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="text-ink-900 font-medium text-right">{value || "—"}</span>
    </div>
  );
}
