"use client";

import { useEffect, useMemo, useState } from "react";
import { miniAppFetch, haptic, useTelegramBackButton } from "./telegram";
import { useI18n } from "./i18n";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "@/lib/cells";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  UserRound,
  Building2,
  Boxes,
  Banknote,
  CreditCard,
  Wallet,
  ClipboardCheck,
  History,
} from "lucide-react";

interface HistoryEvent {
  kind: string;
  date: string;
  itemLabel: string;
  quantityText?: string;
  amount?: number;
  method?: string;
}

type OwnerType = "individual" | "company";
// Банковский счёт (перевод) намеренно исключён — сотрудник принимает оплату лично только
// этими двумя способами, перевод на счёт вносит сам владелец на веб-панели (см.
// lib/validation.ts::incomeCreateSchemaEmployee, app/api/miniapp/income/route.ts).
type Method = "cash" | "card";

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

interface ContainerRef {
  id: string;
  name: string;
  cellCount?: number;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

const METHODS: Array<{ value: Method; icon: typeof Banknote }> = [
  { value: "cash", icon: Banknote },
  { value: "card", icon: CreditCard },
];

export default function AddIncomeWizard({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const STEP_LABELS = [t("income.stepOwner"), t("income.stepContainer"), t("income.stepPayment"), t("income.stepReview")];
  const STEP_ICONS = [UserRound, Boxes, Wallet, ClipboardCheck];
  const METHOD_LABELS_SHORT: Record<string, string> = {
    cash: t("methodShort.cash"),
    card: t("methodShort.card"),
    transfer: t("methodShort.transfer"),
    terminal: t("methodShort.terminal"),
  };

  const [debts, setDebts] = useState<OwnerContainerDebt[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(true);
  const [step, setStep] = useState(0);
  const [ownerKey, setOwnerKey] = useState("");
  const [containerId, setContainerId] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Короткая история по этой связке владелец+контейнер — подгружается, как только сотрудник
  // дошёл до шага "Оплата" (см. render step === 2 ниже), чтобы видеть контекст перед вводом
  // суммы: что и когда уже было (см. GET /api/miniapp/clients/[ownerKey]/history).
  useEffect(() => {
    if (!ownerKey || !containerId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    miniAppFetch(`/api/miniapp/clients/${encodeURIComponent(ownerKey)}/history?containerId=${containerId}&limit=5`)
      .then((r) => r.json())
      .then((d) => setHistory(d.events || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [ownerKey, containerId]);

  useEffect(() => {
    miniAppFetch("/api/miniapp/debts")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        // Не путать серверную ошибку с "записей нет" — раньше оба случая выглядели
        // одинаково для пользователя (см. баг с r.tariff в lib/debt.ts).
        if (!r.ok) {
          setLoadError(d.error || t("income.loadError"));
          return;
        }
        setDebts(d.debts || []);
      })
      .catch(() => setLoadError(t("common.networkError")))
      .finally(() => setLoadingDebts(false));
    // Нужно только для количества камер в выпадающем списке ниже (см. models/Container.ts::cellCount) —
    // ошибку загрузки этого списка отдельно не показываем, дропдаун просто останется на 8 по умолчанию.
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Нативная кнопка "Назад" Telegram зеркалит шаги мастера (см.
  // telegram.ts::useTelegramBackButton) — на экране "готово" её нет.
  useTelegramBackButton(savedScreen ? null : step === 0 ? onExit : back);
  const selectedDebt = containersForOwner.find((d) => d.containerId === containerId);

  function fail(message: string) {
    haptic.error();
    setError(message);
  }

  function next() {
    setError(null);
    if (step === 0 && !ownerKey) return fail(t("income.selectOwner"));
    if (step === 1 && !containerId) return fail(t("income.selectContainer"));
    if (step === 2 && !amount) return fail(t("income.amountRequired"));
    haptic.selection();
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    haptic.selection();
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
          cellNumber: cellNumber || undefined,
          amount,
          method,
          paidAt,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        haptic.error();
        setError(data.error || t("income.saveError"));
        return;
      }
      haptic.success();
      setSavedScreen(true);
    } finally {
      setBusy(false);
    }
  }

  function startAnother() {
    setOwnerKey("");
    setContainerId("");
    setCellNumber("");
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
        <h1 className="text-lg font-semibold text-ink-900 mb-2">{t("income.savedTitle")}</h1>
        <p className="text-sm text-ink-400 mb-6">{t("income.addAnotherQ")}</p>
        <div className="space-y-2">
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={startAnother}>
            {t("income.yesAddMore")}
          </button>
          <button className="btn-ghost w-full py-3 rounded-2xl" onClick={onExit}>
            {t("income.noFinish")}
          </button>
        </div>
      </div>
    );
  }

  const StepIcon = STEP_ICONS[step];

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <button className="btn-icon btn-ghost -ml-2" onClick={step === 0 ? onExit : back} aria-label={t("common.back")}>
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <span className="text-xs font-medium text-ink-400">
          {t("newRecord.stepCounter", { current: step + 1, total: STEP_LABELS.length })}
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
          ) : loadError ? (
            <div className="alert-danger">{loadError}</div>
          ) : owners.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <UserRound className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-sm text-ink-500">{t("income.noRecords")}</p>
            </div>
          ) : (
            owners.map((o) => (
              <button
                key={o.ownerKey}
                onClick={() => {
                  haptic.selection();
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
                      <div className="text-xs text-ink-400">
                        {o.ownerType === "individual" ? t("income.individualLower") : t("income.companyLower")}
                      </div>
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
              onClick={() => {
                haptic.selection();
                setContainerId(d.containerId);
              }}
              className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                containerId === d.containerId ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink-900">{d.containerName}</div>
                  <div className="text-xs mt-0.5">
                    {d.balance > 0 ? (
                      <span className="text-rose-600">{t("income.debtText", { amount: money(d.balance) })}</span>
                    ) : (
                      <span className="text-emerald-600">{t("income.noDebtText")}</span>
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
              {t("income.accruedPaidText", { accrued: money(selectedDebt.accrued), paid: money(selectedDebt.paid) })}{" "}
              {selectedDebt.balance > 0 ? (
                <span className="text-rose-600 font-medium">{t("income.debtText", { amount: money(selectedDebt.balance) })}</span>
              ) : (
                <span className="text-emerald-600 font-medium">{t("income.noDebtText")}</span>
              )}
              .
            </p>
          )}
          {(historyLoading || history.length > 0) && (
            <div className="rounded-xl border border-ink-200 px-3.5 py-2.5">
              <p className="text-xs font-medium text-ink-600 mb-1.5 inline-flex items-center gap-1">
                <History className="h-3.5 w-3.5" strokeWidth={2} />
                {t("income.recentOps")}
              </p>
              {historyLoading ? (
                <div className="skeleton h-10 w-full rounded-lg" />
              ) : (
                <div className="space-y-1">
                  {history.map((h, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">
                        {t(`historyKind.${h.kind}`)} · {new Date(h.date).toLocaleDateString("ru-RU")}
                      </span>
                      <span className="text-ink-700 font-medium">
                        {h.kind === "payment"
                          ? `${money(h.amount || 0)} ${t("common.sum")}${h.method ? ` · ${METHOD_LABELS_SHORT[h.method] || h.method}` : ""}`
                          : h.quantityText || ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="label">{t("income.amountLabel")}</label>
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
            <label className="label">{t("income.cellOptionalLabel")}</label>
            <select className="input" value={cellNumber} onChange={(e) => setCellNumber(e.target.value)}>
              <option value="">{t("income.wholeContainer")}</option>
              {cellNumbersForCount(containers.find((c) => c.id === containerId)?.cellCount || DEFAULT_CELL_COUNT).map(
                (n) => (
                  <option key={n} value={n}>
                    {t("income.cellOption", { n })}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="label">{t("income.paymentMethodLabel")}</label>
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
                  {t(`method.${m.value}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t("income.paidDateLabel")}</label>
            <input type="date" className="input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </div>
          <div>
            <label className="label">{t("income.noteLabel")}</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-0 text-sm">
          <Row label={t("income.reviewOwner")} value={selectedOwner?.ownerLabel} />
          <Row label={t("income.reviewContainer")} value={selectedDebt?.containerName} />
          <Row label={t("income.reviewAmount")} value={`${money(Number(amount) || 0)} ${t("common.sum")}`} />
          <Row label={t("income.reviewMethod")} value={t(`method.${method}`)} />
          <Row label={t("income.reviewDate")} value={new Date(paidAt).toLocaleDateString("ru-RU")} />
          <Row label={t("income.reviewNote")} value={note || "—"} last />
        </div>
      )}

      {error && <div className="alert-danger mt-3">{error}</div>}

      <div className="mt-6">
        {step < STEP_LABELS.length - 1 ? (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={next}>
            {t("newRecord.next")}
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={handleSubmit} disabled={busy}>
            {busy ? t("common.saving") : t("income.recordPayment")}
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
