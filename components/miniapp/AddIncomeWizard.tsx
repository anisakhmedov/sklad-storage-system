"use client";

import { useEffect, useMemo, useState } from "react";
import { miniAppFetch, haptic, useTelegramBackButton } from "./telegram";
import { useI18n } from "./i18n";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  UserRound,
  Building2,
  Boxes,
  LayoutGrid,
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

/** Долг по ОДНОЙ камере одного клиента в одном контейнере (см. lib/debt.ts::ClientCellDebt) —
 * GET /api/miniapp/debts отдаёт уже готовую разбивку до камеры, мастер сам сворачивает её до
 * уровня клиента/контейнера на шагах 0/1. */
interface ClientCellDebt {
  clientId: string;
  ownerType: OwnerType;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  cellNumber: number;
  accrued: number;
  paid: number;
  balance: number;
  /** false — клиент архивный (все его записи закрыты, см. lib/debt.ts::ClientCellDebt.active) —
   * скрыт из шага "Кто платит" ниже независимо от долга: съехавшему больше не принимают оплату
   * через этот список (см. README/обсуждение с владельцем). */
  active: boolean;
  /** false — именно ЭТА камера архивная (клиент из неё съехал, см.
   * lib/debt.ts::ClientCellDebt.cellActive), даже если у клиента есть другие открытые камеры.
   * Такая камера не предлагается на шагах "Контейнер"/"Камера" ниже, а также в фильтре шага 0. */
  cellActive: boolean;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

const METHODS: Array<{ value: Method; icon: typeof Banknote }> = [
  { value: "cash", icon: Banknote },
  { value: "card", icon: CreditCard },
];

export default function AddIncomeWizard({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const STEP_LABELS = [
    t("income.stepOwner"),
    t("income.stepContainer"),
    t("income.stepCell"),
    t("income.stepPayment"),
    t("income.stepReview"),
  ];
  const STEP_ICONS = [UserRound, Boxes, LayoutGrid, Wallet, ClipboardCheck];
  const METHOD_LABELS_SHORT: Record<string, string> = {
    cash: t("methodShort.cash"),
    card: t("methodShort.card"),
    transfer: t("methodShort.transfer"),
    terminal: t("methodShort.terminal"),
  };

  const [debts, setDebts] = useState<ClientCellDebt[]>([]);
  const [loadingDebts, setLoadingDebts] = useState(true);
  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState("");
  // Фильтр списка "Кто платит" (шаг 0) по контейнеру/камере — отдельно от containerId/cellNumber
  // ниже (те выбираются уже ПОСЛЕ владельца, на шагах 1/2, и означают "за что именно платит").
  // Нужен, когда список должников большой — сузить его до конкретного холодильника/камеры,
  // прежде чем искать нужного человека.
  const [filterContainerId, setFilterContainerId] = useState("");
  const [filterCellNumber, setFilterCellNumber] = useState("");
  const [containerId, setContainerId] = useState("");
  const [cellNumber, setCellNumber] = useState<number | null>(null);
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

  // Короткая история по этой связке клиент+контейнер — подгружается, как только сотрудник
  // дошёл до шага "Оплата" (см. render step === 3 ниже), чтобы видеть контекст перед вводом
  // суммы: что и когда уже было (см. GET /api/miniapp/clients/[clientId]/history).
  useEffect(() => {
    if (!clientId || !containerId) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    miniAppFetch(`/api/miniapp/clients/${encodeURIComponent(clientId)}/history?containerId=${containerId}&limit=5`)
      .then((r) => r.json())
      .then((d) => setHistory(d.events || []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [clientId, containerId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Архивная камера (клиент из неё съехал, см. lib/debt.ts::ClientCellDebt.cellActive) не
  // предлагается для приёма оплаты нигде дальше по мастеру — ни в фильтре шага 0, ни на шагах
  // "Контейнер"/"Камера" — независимо от долга по ней, даже если у клиента есть другие открытые
  // камеры (тогда он сам остаётся в списке "Кто платит", просто без этой конкретной камеры).
  const payableDebts = useMemo(() => debts.filter((d) => d.cellActive), [debts]);

  // Контейнеры/камеры для фильтра шага 0 — только те, где у сотрудника реально есть доступные
  // должники (не полный список контейнеров склада, а срез по debts, как и everywhere в этом
  // мастере), плюс сузка камер под уже выбранный контейнер фильтра.
  const filterContainers = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of payableDebts) map.set(d.containerId, d.containerName);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [payableDebts]);

  const filterCells = useMemo(() => {
    const set = new Set<number>();
    for (const d of payableDebts) {
      if (filterContainerId && d.containerId !== filterContainerId) continue;
      set.add(d.cellNumber);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [payableDebts, filterContainerId]);

  const owners = useMemo(() => {
    const map = new Map<string, { clientId: string; ownerType: OwnerType; ownerLabel: string }>();
    for (const d of payableDebts) {
      if (filterContainerId && d.containerId !== filterContainerId) continue;
      if (filterCellNumber && d.cellNumber !== Number(filterCellNumber)) continue;
      if (!map.has(d.clientId)) {
        map.set(d.clientId, { clientId: d.clientId, ownerType: d.ownerType, ownerLabel: d.ownerLabel });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [payableDebts, filterContainerId, filterCellNumber]);

  // Контейнеры клиента — сворачиваем камеры суммой (д.balance/accrued/paid по камерам этого
  // контейнера), чтобы шаг 1 выглядел как раньше ("выберите контейнер, вот долг по нему").
  const containersForOwner = useMemo(() => {
    const map = new Map<string, { containerId: string; containerName: string; accrued: number; paid: number; balance: number }>();
    for (const d of payableDebts) {
      if (d.clientId !== clientId) continue;
      const existing = map.get(d.containerId);
      if (existing) {
        existing.accrued += d.accrued;
        existing.paid += d.paid;
        existing.balance += d.balance;
      } else {
        map.set(d.containerId, { containerId: d.containerId, containerName: d.containerName, accrued: d.accrued, paid: d.paid, balance: d.balance });
      }
    }
    return Array.from(map.values());
  }, [payableDebts, clientId]);

  // Камеры клиента В ЭТОМ контейнере — только те, где у него реально есть записи (не 1..cellCount
  // подряд), с собственным долгом на каждой (см. lib/debt.ts).
  const cellsForOwnerContainer = useMemo(
    () => payableDebts.filter((d) => d.clientId === clientId && d.containerId === containerId).sort((a, b) => a.cellNumber - b.cellNumber),
    [payableDebts, clientId, containerId]
  );

  const selectedOwner = owners.find((o) => o.clientId === clientId);
  const selectedContainer = containersForOwner.find((d) => d.containerId === containerId);
  const selectedCellDebt = cellsForOwnerContainer.find((d) => d.cellNumber === cellNumber);

  // Нативная кнопка "Назад" Telegram зеркалит шаги мастера (см.
  // telegram.ts::useTelegramBackButton) — на экране "готово" её нет.
  useTelegramBackButton(savedScreen ? null : step === 0 ? onExit : back);

  function fail(message: string) {
    haptic.error();
    setError(message);
  }

  function next() {
    setError(null);
    if (step === 0 && !clientId) return fail(t("income.selectOwner"));
    if (step === 1 && !containerId) return fail(t("income.selectContainer"));
    if (step === 2 && !cellNumber) return fail(t("income.selectCell"));
    if (step === 3 && !amount) return fail(t("income.amountRequired"));
    haptic.selection();
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    haptic.selection();
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    if (!selectedOwner || !cellNumber) return;
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/income", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedOwner.clientId,
          containerId,
          cellNumber,
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
    setClientId("");
    setContainerId("");
    setCellNumber(null);
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
          {!loadingDebts && !loadError && filterContainers.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-1">
              <div>
                <label className="label">{t("income.filterContainerLabel")}</label>
                <select
                  className="input"
                  value={filterContainerId}
                  onChange={(e) => {
                    haptic.selection();
                    setFilterContainerId(e.target.value);
                    setFilterCellNumber("");
                  }}
                >
                  <option value="">{t("income.filterAll")}</option>
                  {filterContainers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t("income.filterCellLabel")}</label>
                <select
                  className="input"
                  value={filterCellNumber}
                  onChange={(e) => {
                    haptic.selection();
                    setFilterCellNumber(e.target.value);
                  }}
                >
                  <option value="">{t("income.filterAll")}</option>
                  {filterCells.map((n) => (
                    <option key={n} value={n}>
                      {t("income.cellOption", { n })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
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
              <p className="text-sm text-ink-500">
                {filterContainerId || filterCellNumber ? t("income.filterNoMatch") : t("income.noRecords")}
              </p>
            </div>
          ) : (
            owners.map((o) => (
              <button
                key={o.clientId}
                onClick={() => {
                  haptic.selection();
                  setClientId(o.clientId);
                  setContainerId("");
                  setCellNumber(null);
                }}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                  clientId === o.clientId ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
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
                  {clientId === o.clientId && <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />}
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
                setCellNumber(null);
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
        <div className="space-y-2">
          <p className="text-xs text-ink-400 leading-relaxed mb-1">{t("income.selectCell")}</p>
          {cellsForOwnerContainer.map((d) => (
            <button
              key={d.cellNumber}
              onClick={() => {
                haptic.selection();
                setCellNumber(d.cellNumber);
              }}
              className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                cellNumber === d.cellNumber ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink-900">{t("income.cellOption", { n: d.cellNumber })}</div>
                  <div className="text-xs mt-0.5">
                    {d.balance > 0 ? (
                      <span className="text-rose-600">{t("income.debtText", { amount: money(d.balance) })}</span>
                    ) : (
                      <span className="text-emerald-600">{t("income.noDebtText")}</span>
                    )}
                  </div>
                </div>
                {cellNumber === d.cellNumber && <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />}
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {selectedCellDebt && (
            <p className="text-xs text-ink-500 bg-ink-50 rounded-xl px-3.5 py-2.5 leading-relaxed">
              {t("income.accruedPaidText", { accrued: money(selectedCellDebt.accrued), paid: money(selectedCellDebt.paid) })}{" "}
              {selectedCellDebt.balance > 0 ? (
                <span className="text-rose-600 font-medium">{t("income.debtText", { amount: money(selectedCellDebt.balance) })}</span>
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

      {step === 4 && (
        <div className="card space-y-0 text-sm">
          <Row label={t("income.reviewOwner")} value={selectedOwner?.ownerLabel} />
          <Row label={t("income.reviewContainer")} value={selectedContainer?.containerName} />
          <Row label={t("income.reviewCell")} value={cellNumber ? t("income.cellOption", { n: cellNumber }) : undefined} />
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
