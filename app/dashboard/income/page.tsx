"use client";

import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import {
  Wallet,
  CalendarClock,
  ChevronDown,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  AlertCircle,
  Receipt,
} from "lucide-react";

type OwnerType = "individual" | "company";

interface DebtRecordBreakdown {
  recordId: string;
  productName: string;
  quantity: number;
  unit: string;
  tariff: { type: string; rate: number };
  since: string;
  accrued: number;
}

interface OwnerContainerDebt {
  ownerType: OwnerType;
  ownerKey: string;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  since: string;
  to: string;
  accrued: number;
  paid: number;
  balance: number;
  records: DebtRecordBreakdown[];
}

interface IncomeEntry {
  _id: string;
  ownerType: OwnerType;
  ownerKey: string;
  ownerLabel: string;
  containerId: { _id: string; name: string } | string;
  amount: number;
  method: string;
  paidAt: string;
  note?: string;
  recordedBy: string;
}

const methodLabels: Record<string, string> = { cash: "Наличные", terminal: "Терминал", transfer: "Перевод" };
const methodIcons: Record<string, typeof Banknote> = { cash: Banknote, terminal: CreditCard, transfer: ArrowLeftRight };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

export default function IncomePage() {
  const [toDate, setToDate] = useState(todayInput());
  const [debts, setDebts] = useState<OwnerContainerDebt[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadDebts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/debts?${params.toString()}`);
    const data = await res.json();
    setDebts(data.debts || []);
    setLoading(false);
  }, [toDate]);

  const loadIncomes = useCallback(async () => {
    const res = await fetch("/api/income");
    const data = await res.json();
    setIncomes(data.incomes || []);
  }, []);

  useEffect(() => {
    loadDebts();
  }, [loadDebts]);

  useEffect(() => {
    loadIncomes();
  }, [loadIncomes]);

  async function refreshAll() {
    await Promise.all([loadDebts(), loadIncomes()]);
  }

  const totalBalance = useMemo(() => debts.reduce((s, d) => s + d.balance, 0), [debts]);
  const totalAccrued = useMemo(() => debts.reduce((s, d) => s + d.accrued, 0), [debts]);
  const totalPaid = useMemo(() => debts.reduce((s, d) => s + d.paid, 0), [debts]);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Финансы</p>
        <h1 className="section-title mt-1">Оплаты и задолженность</h1>
        <p className="text-sm text-ink-400 mt-2 max-w-2xl leading-relaxed">
          Тариф фиксируется в записи при её создании (Mini App/веб-панель), а фактическая оплата
          вносится здесь — арендатор может заплатить не сразу и не всей суммой. Задолженность
          считается начислением по тарифу с даты создания записи по выбранную дату (или по
          сегодняшний день, если дата не выбрана) минус сумма внесённых платежей.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-3">
            <Receipt className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(totalAccrued)}</div>
          <div className="text-xs text-ink-400 mt-1">Начислено, сум</div>
        </div>
        <div className="card">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-3">
            <Banknote className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(totalPaid)}</div>
          <div className="text-xs text-ink-400 mt-1">Оплачено, сум</div>
        </div>
        <div className="card">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl mb-3 ${totalBalance > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
            <Wallet className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className={`text-2xl font-semibold tabular-nums ${totalBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {money(totalBalance)}
          </div>
          <div className="text-xs text-ink-400 mt-1">Итоговая задолженность, сум</div>
        </div>
      </div>

      <PaymentForm debts={debts} onSaved={refreshAll} />

      <div className="card mb-6 mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h2 className="card-title">Задолженность по владельцам</h2>
            <p className="card-subtitle">Начислено с даты создания каждой записи по выбранную дату включительно</p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="label">По дату</label>
              <div className="input-icon-wrap">
                <CalendarClock className="input-icon h-4 w-4" strokeWidth={2} />
                <input
                  type="date"
                  className="input"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-secondary" onClick={() => setToDate(todayInput())}>
              Сегодня
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : debts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Wallet className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Записей ещё нет.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Владелец</th>
                    <th>Тип</th>
                    <th>Контейнер</th>
                    <th>С даты</th>
                    <th>Начислено</th>
                    <th>Оплачено</th>
                    <th>Остаток</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => {
                    const key = `${d.ownerKey}::${d.containerId}`;
                    const isOpen = expanded === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          <td className="font-medium text-ink-800">{d.ownerLabel}</td>
                          <td>
                            <span
                              className={`badge ${
                                d.ownerType === "individual"
                                  ? "bg-brand-50 text-brand-700"
                                  : "bg-ink-100 text-ink-600"
                              }`}
                            >
                              {d.ownerType === "individual" ? "физ. лицо" : "юр. лицо"}
                            </span>
                          </td>
                          <td>{d.containerName}</td>
                          <td className="whitespace-nowrap">
                            {new Date(d.since).toLocaleDateString("ru-RU")}
                          </td>
                          <td className="whitespace-nowrap tabular-nums">{money(d.accrued)} сум</td>
                          <td className="whitespace-nowrap tabular-nums">{money(d.paid)} сум</td>
                          <td className="whitespace-nowrap font-semibold tabular-nums">
                            {d.balance > 0 ? (
                              <span className="text-rose-600">{money(d.balance)} сум</span>
                            ) : d.balance < 0 ? (
                              <span className="text-emerald-600">−{money(-d.balance)} сум</span>
                            ) : (
                              <span className="text-ink-400">0</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn-icon btn-ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(isOpen ? null : key);
                              }}
                              aria-label="Детали"
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                strokeWidth={2}
                              />
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={8} className="bg-ink-50/70">
                              <div className="text-xs text-ink-600 py-2.5 space-y-1.5">
                                {d.records.map((r) => (
                                  <div key={r.recordId} className="flex justify-between gap-4">
                                    <span>
                                      {r.productName} · {r.quantity} {r.unit} · с{" "}
                                      {new Date(r.since).toLocaleDateString("ru-RU")}
                                    </span>
                                    <span className="tabular-nums font-medium text-ink-700">{money(r.accrued)} сум начислено</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 pt-4 border-t border-ink-100 flex justify-between items-center text-sm font-medium text-ink-700">
              <span>Итого задолженность</span>
              <span className={`text-base ${totalBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {money(totalBalance)} сум
              </span>
            </div>
          </>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="card-title mb-3">Последние платежи</h2>
        {incomes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Receipt className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Платежей ещё не было.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Владелец</th>
                <th>Контейнер</th>
                <th>Сумма</th>
                <th>Способ</th>
                <th>Кто внёс</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {incomes.map((inc) => {
                const MethodIcon = methodIcons[inc.method] || Banknote;
                return (
                  <tr key={inc._id}>
                    <td className="whitespace-nowrap">{new Date(inc.paidAt).toLocaleDateString("ru-RU")}</td>
                    <td className="text-ink-800">{inc.ownerLabel}</td>
                    <td>{typeof inc.containerId === "object" ? inc.containerId.name : inc.containerId}</td>
                    <td className="whitespace-nowrap font-medium text-ink-800 tabular-nums">{money(inc.amount)} сум</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-ink-600">
                        <MethodIcon className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
                        {methodLabels[inc.method] || inc.method}
                      </span>
                    </td>
                    <td className="text-ink-500">{inc.recordedBy}</td>
                    <td className="text-ink-400">{inc.note || "—"}</td>
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

function PaymentForm({ debts, onSaved }: { debts: OwnerContainerDebt[]; onSaved: () => void }) {
  const owners = useMemo(() => {
    const map = new Map<string, { ownerKey: string; ownerType: OwnerType; ownerLabel: string }>();
    for (const d of debts) {
      if (!map.has(d.ownerKey)) {
        map.set(d.ownerKey, { ownerKey: d.ownerKey, ownerType: d.ownerType, ownerLabel: d.ownerLabel });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [debts]);

  const [ownerKey, setOwnerKey] = useState("");
  const [containerId, setContainerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const containersForOwner = useMemo(
    () => debts.filter((d) => d.ownerKey === ownerKey),
    [debts, ownerKey]
  );

  const selectedDebt = containersForOwner.find((d) => d.containerId === containerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const owner = owners.find((o) => o.ownerKey === ownerKey);
    if (!owner || !containerId) {
      setError("Выберите владельца и контейнер");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerType: owner.ownerType,
          ownerKey: owner.ownerKey,
          ownerLabel: owner.ownerLabel,
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
      setAmount("");
      setNote("");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl">
      <div className="card-header">
        <div>
          <h2 className="card-title flex items-center gap-2">
            <Wallet className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Записать оплату
          </h2>
        </div>
      </div>
      {owners.length === 0 ? (
        <div className="empty-state py-8">
          <p className="text-sm text-ink-500">Ещё нет ни одной записи о размещении товара.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Владелец груза</label>
              <select
                className="input"
                value={ownerKey}
                onChange={(e) => {
                  setOwnerKey(e.target.value);
                  setContainerId("");
                }}
              >
                <option value="">Выберите владельца</option>
                {owners.map((o) => (
                  <option key={o.ownerKey} value={o.ownerKey}>
                    {o.ownerLabel} ({o.ownerType === "individual" ? "физ." : "юр."})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Контейнер</label>
              <select
                className="input"
                value={containerId}
                onChange={(e) => setContainerId(e.target.value)}
                disabled={!ownerKey}
              >
                <option value="">Выберите контейнер</option>
                {containersForOwner.map((d) => (
                  <option key={d.containerId} value={d.containerId}>
                    {d.containerName}
                    {d.balance > 0 ? ` — долг ${money(d.balance)} сум` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedDebt && (
            <p className="text-xs text-ink-500 bg-ink-50 rounded-lg px-3 py-2">
              Текущий остаток по этой связке: начислено {money(selectedDebt.accrued)} сум, оплачено{" "}
              {money(selectedDebt.paid)} сум,{" "}
              {selectedDebt.balance > 0 ? (
                <span className="text-rose-600 font-medium">долг {money(selectedDebt.balance)} сум</span>
              ) : (
                <span className="text-emerald-600 font-medium">задолженности нет</span>
              )}
              .
            </p>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Сумма, сум</label>
              <input
                type="number"
                inputMode="decimal"
                className="input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Способ оплаты</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Наличные</option>
                <option value="terminal">Терминал</option>
                <option value="transfer">Перевод</option>
              </select>
            </div>
            <div>
              <label className="label">Дата оплаты</label>
              <input
                type="date"
                className="input"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
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
            {busy ? "Сохранение…" : "Записать оплату"}
          </button>
        </form>
      )}
    </div>
  );
}
