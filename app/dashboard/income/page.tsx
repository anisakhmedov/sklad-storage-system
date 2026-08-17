"use client";

import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Wallet,
  CalendarClock,
  ChevronDown,
  Banknote,
  CreditCard,
  Landmark,
  AlertCircle,
  Receipt,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Snowflake,
  MinusCircle,
  Check,
  X,
  Clock,
  Search,
  XCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "@/lib/cells";

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

interface ClientCellDebt {
  ownerType: OwnerType;
  clientId: string;
  ownerLabel: string;
  containerId: string;
  containerName: string;
  cellNumber: number;
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
  clientId: string | null;
  ownerLabel: string;
  containerId: { _id: string; name: string } | string | null;
  cellNumber?: number;
  amount: number;
  method: string;
  paidAt: string;
  note?: string;
  recordedBy: string;
  /** "general" — запись из «Приход на холодильник» (GeneralIncome), не привязана к арендатору/
   * контейнеру и не редактируется через это же модальное окно (см. IncomeEditModal). */
  source?: "tenant" | "general";
}

interface FinanceSummary {
  totalIncome: number;
  kassa: number;
  cardTotal: number;
  transferTotal: number;
  externalIncomeTotal: number;
  totalExpenses: number;
  salaryTotal: number;
  balance: number;
  pendingExpensesCount: number;
  ownerCashWithdrawn: number;
}

interface IncomeBreakdownRow {
  containerId: string;
  containerName: string;
  cellNumber: number | null;
  total: number;
}

interface ContainerRef {
  _id: string;
  name: string;
  cellCount?: number;
}

interface ExpenseEntry {
  _id: string;
  type: "owner_withdrawal" | "salary" | "other";
  containerId: { _id: string; name: string } | string | null;
  amount: number;
  method: string;
  note?: string;
  employeeName?: string;
  createdBy: string;
  createdByRole: "owner" | "employee";
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface ContainerFinanceRow {
  containerId: string | null;
  containerName: string;
  income: number;
  expenses: number;
  balance: number;
}

const expenseStatusLabels: Record<string, string> = {
  approved: "Одобрено",
  pending: "На одобрении",
  rejected: "Отклонено",
};

const expenseTypeLabels: Record<string, string> = {
  owner_withdrawal: "Снятие владельцем",
  salary: "Зарплата",
  other: "Прочее",
};

// "terminal" больше не предлагается как способ ни для расходов, ни для оплат — оставлен в
// подписях только чтобы старые записи (созданные до отказа от терминала) не показывали "—"/
// undefined вместо названия способа.
const methodLabels: Record<string, string> = {
  cash: "Наличные",
  terminal: "Терминал",
  transfer: "Банковский счет (перевод)",
  card: "Банковская карта (П2П)",
};
const methodIcons: Record<string, typeof Banknote> = {
  cash: Banknote,
  terminal: CreditCard,
  transfer: Landmark,
  card: CreditCard,
};
const SELECTABLE_METHODS: Array<{ value: string; label: string }> = [
  { value: "cash", label: "Наличные" },
  { value: "transfer", label: "Банковский счет (перевод)" },
  { value: "card", label: "Банковская карта (П2П)" },
];
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

export default function IncomePage() {
  const [toDate, setToDate] = useState(todayInput());
  const [debts, setDebts] = useState<ClientCellDebt[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [debtsError, setDebtsError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [breakdown, setBreakdown] = useState<IncomeBreakdownRow[]>([]);
  const [byContainer, setByContainer] = useState<ContainerFinanceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  // Отдельный фильтр по контейнеру для карточек "Касса и расходы" вверху страницы — независим от
  // incomeFilter.containerId (тот фильтрует таблицы "Задолженность"/"Последние платежи" ниже).
  const [financeContainerId, setFinanceContainerId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showGeneralIncomeModal, setShowGeneralIncomeModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);

  // Таблицы стоят значительно ниже карточек кассы/расходов — сам по себе клик по карточке
  // фильтрует их и без этого, но на длинной странице эффект легко не заметить (кажется, что
  // "ничего не произошло"), поэтому клик ещё и докручивает нужную таблицу в видимую область.
  const incomesTableRef = useRef<HTMLDivElement>(null);
  const expensesTableRef = useRef<HTMLDivElement>(null);
  function scrollToTable(ref: React.RefObject<HTMLDivElement>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Фильтр таблицы "Последние платежи" — управляется и селектами в панели фильтра, и кликом
  // по карточкам кассы/П2П/банк.перевода/внешнего прихода (см. cardClickFilter ниже).
  const [incomeFilter, setIncomeFilter] = useState({
    method: "",
    containerId: "",
    cellNumber: "",
    search: "",
    source: "",
  });
  // Фильтр таблицы "Расходы" — управляется кликом по карточкам Расходы/Зарплата/Владелец забрал.
  // status — карточки над таблицей (см. lib/finance.ts::getFinanceSummary) считают суммы ТОЛЬКО
  // по одобренным расходам, поэтому клик по конкретной карточке (Зарплата/Владелец забрал)
  // фильтрует и по status: "approved" — иначе в таблице вперемешку показывались бы ещё и
  // заявки "на одобрении"/"отклонено", и сумма видимых строк не совпадала бы с цифrой на карточке.
  const [expenseFilter, setExpenseFilter] = useState({ type: "", method: "", status: "", containerId: "" });

  function toggleIncomeMethodFilter(method: string) {
    setIncomeFilter((f) => ({ ...f, method: f.method === method ? "" : method }));
    scrollToTable(incomesTableRef);
  }
  function toggleIncomeSourceFilter(source: string) {
    setIncomeFilter((f) => ({ ...f, source: f.source === source ? "" : source }));
    scrollToTable(incomesTableRef);
  }
  function toggleExpenseFilter(type: string, method: string, status = "") {
    setExpenseFilter((f) =>
      f.type === type && f.method === method && f.status === status
        ? { ...f, type: "", method: "", status: "" }
        : { ...f, type, method, status }
    );
    scrollToTable(expensesTableRef);
  }
  function resetExpenseFilter() {
    setExpenseFilter({ type: "", method: "", status: "", containerId: "" });
    scrollToTable(expensesTableRef);
  }

  const loadFinance = useCallback(async () => {
    const params = new URLSearchParams();
    if (financeContainerId) params.set("containerId", financeContainerId);
    const res = await fetch(`/api/finance/summary?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setFinance(data.summary);
  }, [financeContainerId]);

  const loadExpenses = useCallback(async () => {
    const res = await fetch("/api/expenses");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setExpenses(data.expenses || []);
  }, []);

  const loadBreakdown = useCallback(async () => {
    const res = await fetch("/api/finance/breakdown");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setBreakdown(data.breakdown || []);
  }, []);

  const loadByContainer = useCallback(async () => {
    const res = await fetch("/api/finance/by-container");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setByContainer(data.rows || []);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsOwner(d.user?.role === "owner"));
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
    loadExpenses();
    loadBreakdown();
    loadByContainer();
  }, [loadExpenses, loadBreakdown, loadByContainer]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const loadDebts = useCallback(async () => {
    setLoading(true);
    setDebtsError(null);
    const params = new URLSearchParams();
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/debts?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    // Не путать серверную ошибку с "записей нет" — оба случая раньше выглядели одинаково
    // (см. баг с r.tariff в lib/debt.ts на записях без тарифа).
    if (!res.ok) {
      setDebtsError(data.error || "Не удалось загрузить задолженность");
      setDebts([]);
      setLoading(false);
      return;
    }
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
    await Promise.all([loadDebts(), loadIncomes(), loadFinance(), loadExpenses(), loadBreakdown(), loadByContainer()]);
  }

  async function handleExpenseStatus(id: string, status: "approved" | "rejected") {
    await fetch(`/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await Promise.all([loadExpenses(), loadFinance()]);
  }

  async function handleDeleteIncome(inc: IncomeEntry) {
    if (!confirm(`Удалить платёж «${inc.ownerLabel}» на сумму ${money(inc.amount)} сум? Это действие необратимо.`)) return;
    await fetch(`/api/income/${inc._id}`, { method: "DELETE" });
    await refreshAll();
  }

  // Общий фильтр по контейнерам (incomeFilter.containerId) — применяется и к задолженности
  // здесь, и к "Последним платежам" ниже (см. filteredIncomes), одним и тем же выбором.
  const filteredDebts = useMemo(
    () => (incomeFilter.containerId ? debts.filter((d) => d.containerId === incomeFilter.containerId) : debts),
    [debts, incomeFilter.containerId]
  );
  const totalBalance = useMemo(() => filteredDebts.reduce((s, d) => s + d.balance, 0), [filteredDebts]);
  const totalAccrued = useMemo(() => filteredDebts.reduce((s, d) => s + d.accrued, 0), [filteredDebts]);
  const totalPaid = useMemo(() => filteredDebts.reduce((s, d) => s + d.paid, 0), [filteredDebts]);

  const filteredIncomes = useMemo(() => {
    const search = incomeFilter.search.trim().toLowerCase();
    return incomes.filter((inc) => {
      if (incomeFilter.method && inc.method !== incomeFilter.method) return false;
      if (incomeFilter.source && (inc.source || "tenant") !== incomeFilter.source) return false;
      const containerId = inc.containerId && typeof inc.containerId === "object" ? inc.containerId._id : inc.containerId;
      if (incomeFilter.containerId && containerId !== incomeFilter.containerId) return false;
      if (incomeFilter.cellNumber && String(inc.cellNumber ?? "") !== incomeFilter.cellNumber) return false;
      if (search && !inc.ownerLabel.toLowerCase().includes(search)) return false;
      return true;
    });
  }, [incomes, incomeFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (expenseFilter.type && exp.type !== expenseFilter.type) return false;
      if (expenseFilter.method && exp.method !== expenseFilter.method) return false;
      if (expenseFilter.status && exp.status !== expenseFilter.status) return false;
      const containerId = exp.containerId && typeof exp.containerId === "object" ? exp.containerId._id : exp.containerId;
      if (expenseFilter.containerId && containerId !== expenseFilter.containerId) return false;
      return true;
    });
  }, [expenses, expenseFilter]);

  const hasIncomeFilter = !!(
    incomeFilter.method ||
    incomeFilter.containerId ||
    incomeFilter.cellNumber ||
    incomeFilter.search ||
    incomeFilter.source
  );
  const hasExpenseFilter = !!(expenseFilter.type || expenseFilter.method || expenseFilter.status || expenseFilter.containerId);

  // Диапазон камер для фильтра "Последние платежи" — камеры теперь редактируются индивидуально
  // на контейнер (см. models/Container.ts::cellCount): если выбран конкретный контейнер, берём
  // его cellCount, иначе — максимум по всем контейнерам (чтобы не спрятать камеры 9+ у больших
  // контейнеров, когда фильтр по контейнеру не задан).
  const filterCellOptions = useMemo(() => {
    if (incomeFilter.containerId) {
      const c = containers.find((c) => c._id === incomeFilter.containerId);
      return cellNumbersForCount(c?.cellCount || DEFAULT_CELL_COUNT);
    }
    const maxCount = containers.reduce((max, c) => Math.max(max, c.cellCount || DEFAULT_CELL_COUNT), DEFAULT_CELL_COUNT);
    return cellNumbersForCount(maxCount);
  }, [containers, incomeFilter.containerId]);

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

      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-ink-800">Касса и расходы</h2>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="label">Контейнер</label>
            <select
              className="input"
              value={financeContainerId}
              onChange={(e) => setFinanceContainerId(e.target.value)}
            >
              <option value="">Все контейнеры</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {isOwner && (
            <button className="btn-secondary" onClick={() => setShowGeneralIncomeModal(true)}>
              <Snowflake className="h-4 w-4" strokeWidth={2.1} />
              Приход на холодильник
            </button>
          )}
          <button className="btn-secondary" onClick={() => setShowExpenseModal(true)}>
            <MinusCircle className="h-4 w-4" strokeWidth={2.1} />
            Расход
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-400 mb-2">
        Карточки кассы/П2П/банк. перевода, а также «Расходы»/«Зарплата»/«Владелец забрал» —
        кликабельны: фильтруют таблицу платежей или расходов ниже именно под этот блок.
        {financeContainerId && " Суммы на карточках сейчас показаны только по выбранному контейнеру."}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <button
          className="card text-left transition-colors hover:border-brand-300"
          onClick={() => {
            setIncomeFilter({ method: "", containerId: "", cellNumber: "", search: "", source: "" });
            scrollToTable(incomesTableRef);
          }}
          title="Показать все платежи без фильтра"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-3">
            <TrendingUp className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.totalIncome || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Общий приход, сум</div>
        </button>
        <button
          className={`card text-left transition-colors ${incomeFilter.method === "cash" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleIncomeMethodFilter("cash")}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 mb-3">
            <Banknote className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.kassa || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Касса (наличные), сум</div>
        </button>
        <button
          className={`card text-left transition-colors ${incomeFilter.method === "card" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleIncomeMethodFilter("card")}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 mb-3">
            <CreditCard className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.cardTotal || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Банковская карта (П2П), сум</div>
        </button>
        <button
          className={`card text-left transition-colors ${incomeFilter.method === "transfer" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleIncomeMethodFilter("transfer")}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 mb-3">
            <Landmark className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.transferTotal || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Банковский счёт (перевод), сум</div>
        </button>
        <button
          className={`card text-left transition-colors ${incomeFilter.source === "general" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleIncomeSourceFilter("general")}
          title="Приход, внесённый через «Приход на холодильник» — не привязан к конкретному арендатору"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 mb-3">
            <Snowflake className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.externalIncomeTotal || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Внешний приход (холодильник), сум</div>
        </button>
        <button
          className="card text-left transition-colors hover:border-brand-300"
          onClick={resetExpenseFilter}
          title="Показать все расходы без фильтра"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 mb-3">
            <TrendingDown className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.totalExpenses || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Расходы, сум (клик — сброс фильтра)</div>
        </button>
        <button
          className={`card text-left transition-colors ${expenseFilter.type === "salary" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleExpenseFilter("salary", "", "approved")}
          title="Сумма — только по одобренным заявкам; клик покажет ровно эти строки"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 mb-3">
            <Landmark className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.salaryTotal || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Зарплата сотрудникам, сум</div>
        </button>
        <div className="card">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 mb-3">
            <PiggyBank className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.balance || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Остаток, сум</div>
        </div>
        <button
          className={`card text-left transition-colors ${expenseFilter.type === "owner_withdrawal" && expenseFilter.method === "cash" ? "ring-2 ring-brand-600" : "hover:border-brand-300"}`}
          onClick={() => toggleExpenseFilter("owner_withdrawal", "cash", "approved")}
          title="Сумма — только по одобренным заявкам; клик покажет ровно эти строки"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 mb-3">
            <Banknote className="h-4.5 w-4.5" strokeWidth={2} />
          </div>
          <div className="text-2xl font-semibold text-ink-900 tabular-nums">{money(finance?.ownerCashWithdrawn || 0)}</div>
          <div className="text-xs text-ink-400 mt-1">Владелец забрал наличными, сум</div>
        </button>
      </div>

      {finance && finance.pendingExpensesCount > 0 && (
        <div className="alert-warning mb-6">
          <Clock className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
          <span>
            {isOwner
              ? `Есть ${finance.pendingExpensesCount} заявок на расход, ожидающих вашего подтверждения (см. таблицу ниже).`
              : `Есть ${finance.pendingExpensesCount} заявок на расход, ожидающих подтверждения владельцем.`}
          </span>
        </div>
      )}

      <div className="card mb-8 overflow-x-auto">
        <h2 className="card-title mb-1">Оборот и расход по контейнерам</h2>
        <p className="card-subtitle mb-3">
          Приход (оплаты арендаторов + «Приход на холодильник») и одобренные расходы — отдельно
          по каждому контейнеру.
        </p>
        {byContainer.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">Контейнеров пока нет.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Контейнер</th>
                <th>Оборот (приход)</th>
                <th>Расход</th>
                <th>Баланс</th>
              </tr>
            </thead>
            <tbody>
              {byContainer.map((row) => (
                <tr key={row.containerId ?? "__none"} className={row.containerId === null ? "text-ink-400" : undefined}>
                  <td className={row.containerId === null ? "" : "font-medium text-ink-800"}>{row.containerName}</td>
                  <td className="whitespace-nowrap tabular-nums text-emerald-700">{money(row.income)} сум</td>
                  <td className="whitespace-nowrap tabular-nums text-rose-600">{money(row.expenses)} сум</td>
                  <td className={`whitespace-nowrap font-semibold tabular-nums ${row.balance < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {money(row.balance)} сум
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div ref={expensesTableRef} className="card mb-8 overflow-x-auto scroll-mt-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="card-title mb-0">Расходы</h2>
          {hasExpenseFilter && (
            <button className="btn-secondary btn-sm" onClick={resetExpenseFilter}>
              <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
              Сбросить фильтр (
              {[
                expenseTypeLabels[expenseFilter.type],
                methodLabels[expenseFilter.method],
                expenseStatusLabels[expenseFilter.status],
                containers.find((c) => c._id === expenseFilter.containerId)?.name,
              ]
                .filter(Boolean)
                .join(" · ") || "активен"}
              )
            </button>
          )}
        </div>
        <div className="max-w-xs mb-4">
          <label className="label">Контейнер</label>
          <select
            className="input"
            value={expenseFilter.containerId}
            onChange={(e) => setExpenseFilter({ ...expenseFilter, containerId: e.target.value })}
          >
            <option value="">Все</option>
            {containers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {expenses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MinusCircle className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Расходов ещё не было.</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">По этому фильтру расходов не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Контейнер</th>
                <th>Сумма</th>
                <th>Способ</th>
                <th>Кому/примечание</th>
                <th>Кто внёс</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => {
                const MethodIcon = methodIcons[exp.method] || Banknote;
                return (
                  <tr key={exp._id}>
                    <td className="whitespace-nowrap text-ink-500">
                      {new Date(exp.createdAt).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="text-ink-800">{expenseTypeLabels[exp.type] || exp.type}</td>
                    <td className="text-ink-500">
                      {exp.containerId && typeof exp.containerId === "object" ? exp.containerId.name : "—"}
                    </td>
                    <td className="whitespace-nowrap font-medium text-ink-800 tabular-nums">{money(exp.amount)} сум</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-ink-600">
                        <MethodIcon className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
                        {methodLabels[exp.method] || exp.method}
                      </span>
                    </td>
                    <td className="text-ink-500">{exp.employeeName || exp.note || "—"}</td>
                    <td className="text-ink-500">{exp.createdBy}</td>
                    <td>
                      <span
                        className={`badge ${
                          exp.status === "approved"
                            ? "bg-emerald-100 text-emerald-700"
                            : exp.status === "rejected"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {exp.status === "approved" ? "Одобрено" : exp.status === "rejected" ? "Отклонено" : "На одобрении"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        {exp.status === "pending" && isOwner && (
                          <>
                            <button
                              className="btn-icon btn-secondary"
                              title="Подтвердить"
                              onClick={() => handleExpenseStatus(exp._id, "approved")}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </button>
                            <button
                              className="btn-icon btn-danger-ghost"
                              title="Отклонить"
                              onClick={() => handleExpenseStatus(exp._id, "rejected")}
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                            </button>
                          </>
                        )}
                        {/* Полное редактирование — независимо от способа оплаты и статуса
                            (см. app/api/expenses/[id]/route.ts). */}
                        <button
                          className="btn-icon btn-secondary"
                          title="Изменить"
                          onClick={() => setEditingExpense(exp)}
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="text-base font-semibold text-ink-800 mb-3">Задолженность арендаторов</h2>
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
              <label className="label">Контейнер</label>
              <select
                className="input"
                value={incomeFilter.containerId}
                onChange={(e) => setIncomeFilter({ ...incomeFilter, containerId: e.target.value })}
              >
                <option value="">Все</option>
                {containers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
        ) : debtsError ? (
          <div className="alert-danger">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
            <span>{debtsError}</span>
          </div>
        ) : filteredDebts.length === 0 ? (
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
                    <th>Камера</th>
                    <th>С даты</th>
                    <th>Начислено</th>
                    <th>Оплачено</th>
                    <th>Остаток</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDebts.map((d) => {
                    const key = `${d.clientId}::${d.containerId}::${d.cellNumber}`;
                    const isOpen = expanded === key;
                    return (
                      <Fragment key={key}>
                        <tr
                          className="cursor-pointer"
                          onClick={() => setExpanded(isOpen ? null : key)}
                        >
                          <td className="font-medium text-ink-800">
                            <Link
                              href={`/dashboard/tenants/${encodeURIComponent(d.clientId)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-brand-600"
                            >
                              {d.ownerLabel}
                            </Link>
                          </td>
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
                          <td className="text-ink-600">{d.cellNumber}</td>
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
                            <td colSpan={9} className="bg-ink-50/70">
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

      <div ref={incomesTableRef} className="card overflow-x-auto scroll-mt-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="card-title mb-0">Последние платежи</h2>
          {hasIncomeFilter && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => setIncomeFilter({ method: "", containerId: "", cellNumber: "", search: "", source: "" })}
            >
              <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
              Сбросить фильтр
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="label">Способ оплаты</label>
            <select
              className="input"
              value={incomeFilter.method}
              onChange={(e) => setIncomeFilter({ ...incomeFilter, method: e.target.value })}
            >
              <option value="">Все</option>
              {SELECTABLE_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Источник</label>
            <select
              className="input"
              value={incomeFilter.source}
              onChange={(e) => setIncomeFilter({ ...incomeFilter, source: e.target.value })}
            >
              <option value="">Все</option>
              <option value="tenant">Оплата арендатора</option>
              <option value="general">Внешний приход (холодильник)</option>
            </select>
          </div>
          <div>
            <label className="label">Контейнер (бокс)</label>
            <select
              className="input"
              value={incomeFilter.containerId}
              onChange={(e) => setIncomeFilter({ ...incomeFilter, containerId: e.target.value })}
            >
              <option value="">Все</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Камера</label>
            <select
              className="input"
              value={incomeFilter.cellNumber}
              onChange={(e) => setIncomeFilter({ ...incomeFilter, cellNumber: e.target.value })}
            >
              <option value="">Все</option>
              {filterCellOptions.map((n) => (
                <option key={n} value={n}>
                  Камера {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Поиск по имени владельца</label>
            <div className="input-icon-wrap">
              <Search className="input-icon h-4 w-4" strokeWidth={2} />
              <input
                className="input"
                placeholder="ФИО/наименование"
                value={incomeFilter.search}
                onChange={(e) => setIncomeFilter({ ...incomeFilter, search: e.target.value })}
              />
            </div>
          </div>
        </div>

        {incomes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Receipt className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Платежей ещё не было.</p>
          </div>
        ) : filteredIncomes.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">По этому фильтру платежей не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Владелец</th>
                <th>Контейнер</th>
                <th>Камера</th>
                <th>Сумма</th>
                <th>Способ</th>
                <th>Кто внёс</th>
                <th>Примечание</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredIncomes.map((inc) => {
                const MethodIcon = methodIcons[inc.method] || Banknote;
                return (
                  <tr key={inc._id}>
                    <td className="whitespace-nowrap">{new Date(inc.paidAt).toLocaleDateString("ru-RU")}</td>
                    <td className="text-ink-800">
                      {inc.source === "general" ? (
                        <span className="inline-flex items-center gap-1.5 text-cyan-700">
                          <Snowflake className="h-3.5 w-3.5" strokeWidth={2} />
                          {inc.ownerLabel}
                        </span>
                      ) : (
                        <Link
                          href={`/dashboard/tenants/${encodeURIComponent(inc.clientId || "")}`}
                          className="hover:text-brand-600"
                        >
                          {inc.ownerLabel}
                        </Link>
                      )}
                    </td>
                    <td>
                      {typeof inc.containerId === "object" ? inc.containerId?.name || "—" : inc.containerId || "—"}
                    </td>
                    <td className="text-ink-600">{inc.source === "general" ? "—" : (inc.cellNumber ?? "—")}</td>
                    <td className="whitespace-nowrap font-medium text-ink-800 tabular-nums">{money(inc.amount)} сум</td>
                    <td>
                      <span className="inline-flex items-center gap-1.5 text-ink-600">
                        <MethodIcon className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
                        {methodLabels[inc.method] || inc.method}
                      </span>
                    </td>
                    <td className="text-ink-500">{inc.recordedBy}</td>
                    <td className="text-ink-400">{inc.note || "—"}</td>
                    <td className="whitespace-nowrap">
                      {/* Полное редактирование — независимо от способа оплаты (см.
                          app/api/income/[id]/route.ts). Записи "Приход на холодильник" здесь не
                          редактируются — у них нет своего PATCH-эндпоинта, править/удалять такую
                          запись пока можно только напрямую в БД. */}
                      {inc.source !== "general" && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            className="btn-icon btn-secondary"
                            title="Изменить"
                            onClick={() => setEditingIncome(inc)}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            className="btn-icon btn-danger-ghost"
                            title="Удалить платёж"
                            onClick={() => handleDeleteIncome(inc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto mt-8">
        <h2 className="card-title mb-1">По холодильникам и камерам</h2>
        <p className="card-subtitle mb-3">
          Сумма фактически полученных платежей (Income), сгруппированная по контейнеру и камере.
        </p>
        {breakdown.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">Платежей ещё не было.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Контейнер</th>
                <th>Камера</th>
                <th>Сумма получено</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => (
                <tr key={`${b.containerId}::${b.cellNumber ?? "none"}`}>
                  <td className="text-ink-800">{b.containerName}</td>
                  <td className="text-ink-600">{b.cellNumber ?? "За контейнер в целом"}</td>
                  <td className="whitespace-nowrap font-medium text-ink-800 tabular-nums">{money(b.total)} сум</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showExpenseModal && (
        <ExpenseModal
          containers={containers}
          onClose={() => setShowExpenseModal(false)}
          onSaved={async () => {
            setShowExpenseModal(false);
            await refreshAll();
          }}
        />
      )}
      {showGeneralIncomeModal && (
        <GeneralIncomeModal
          containers={containers}
          onClose={() => setShowGeneralIncomeModal(false)}
          onSaved={async () => {
            setShowGeneralIncomeModal(false);
            await refreshAll();
          }}
        />
      )}
      {editingIncome && (
        <IncomeEditModal
          income={editingIncome}
          containers={containers}
          onClose={() => setEditingIncome(null)}
          onSaved={async () => {
            setEditingIncome(null);
            await refreshAll();
          }}
        />
      )}
      {editingExpense && (
        <ExpenseEditModal
          expense={editingExpense}
          containers={containers}
          onClose={() => setEditingExpense(null)}
          onSaved={async () => {
            setEditingExpense(null);
            await refreshAll();
          }}
        />
      )}
    </div>
  );
}

function PaymentForm({
  debts,
  onSaved,
}: {
  debts: ClientCellDebt[];
  onSaved: () => void;
}) {
  const owners = useMemo(() => {
    const map = new Map<string, { clientId: string; ownerType: OwnerType; ownerLabel: string }>();
    for (const d of debts) {
      if (!map.has(d.clientId)) {
        map.set(d.clientId, { clientId: d.clientId, ownerType: d.ownerType, ownerLabel: d.ownerLabel });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.ownerLabel.localeCompare(b.ownerLabel, "ru"));
  }, [debts]);

  const [clientId, setClientId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [paidAt, setPaidAt] = useState(todayInput());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Контейнеры клиента — свёрнуты суммой по камерам (см. lib/debt.ts::ClientCellDebt), чтобы
  // выпадающий список выглядел как раньше ("контейнер — долг по нему целиком").
  const containersForOwner = useMemo(() => {
    const map = new Map<string, { containerId: string; containerName: string; balance: number }>();
    for (const d of debts) {
      if (d.clientId !== clientId) continue;
      const existing = map.get(d.containerId);
      if (existing) existing.balance += d.balance;
      else map.set(d.containerId, { containerId: d.containerId, containerName: d.containerName, balance: d.balance });
    }
    return Array.from(map.values());
  }, [debts, clientId]);

  // Камеры клиента В ЭТОМ контейнере — только те, где у него реально есть записи (см.
  // lib/validation.ts::incomeCreateSchema — камера теперь обязательна).
  const cellsForOwnerContainer = useMemo(
    () => debts.filter((d) => d.clientId === clientId && d.containerId === containerId).sort((a, b) => a.cellNumber - b.cellNumber),
    [debts, clientId, containerId]
  );

  const selectedDebt = cellsForOwnerContainer.find((d) => d.cellNumber === Number(cellNumber));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const owner = owners.find((o) => o.clientId === clientId);
    if (!owner || !containerId || !cellNumber) {
      setError("Выберите владельца, контейнер и камеру");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: owner.clientId,
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
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setContainerId("");
                  setCellNumber("");
                }}
              >
                <option value="">Выберите владельца</option>
                {owners.map((o) => (
                  <option key={o.clientId} value={o.clientId}>
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
                onChange={(e) => {
                  setContainerId(e.target.value);
                  setCellNumber("");
                }}
                disabled={!clientId}
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

          <div>
            <label className="label">Камера — за какую именно платит клиент</label>
            <select
              className="input"
              value={cellNumber}
              onChange={(e) => setCellNumber(e.target.value)}
              disabled={!containerId}
            >
              <option value="">Выберите камеру</option>
              {cellsForOwnerContainer.map((d) => (
                <option key={d.cellNumber} value={d.cellNumber}>
                  Камера {d.cellNumber}
                  {d.balance > 0 ? ` — долг ${money(d.balance)} сум` : " — задолженности нет"}
                </option>
              ))}
            </select>
          </div>

          {selectedDebt && (
            <p className="text-xs text-ink-500 bg-ink-50 rounded-lg px-3 py-2">
              Текущий остаток по этой камере: начислено {money(selectedDebt.accrued)} сум, оплачено{" "}
              {money(selectedDebt.paid)} сум,{" "}
              {selectedDebt.balance > 0 ? (
                <span className="text-rose-600 font-medium">долг {money(selectedDebt.balance)} сум</span>
              ) : (
                <span className="text-emerald-600 font-medium">задолженности нет</span>
              )}
              .
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
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
                {SELECTABLE_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Дата оплаты</label>
              <input
                type="date"
                className="input"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Примечание</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
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

interface EmployeeOption {
  _id: string;
  name: string;
}

/**
 * Поле "Кому (имя сотрудника)" для расхода типа "зарплата" — выбор из реального списка
 * сотрудников (включая заведённых без доступа к платформе, см. app/dashboard/employees/page.tsx)
 * вместо произвольного текста, который раньше легко было ввести с опечаткой или дублирующим
 * именем. "Другое…" оставлен на случай, если нужного сотрудника ещё нет в списке или запись
 * относится к кому-то, кто уже удалён — employeeName как хранился строкой, так и хранится.
 */
function EmployeeNameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees || []))
      .catch(() => {});
  }, []);

  const knownNames = new Set(employees.map((e) => e.name));
  const isCustom = value !== "" && !knownNames.has(value);
  const [custom, setCustom] = useState(isCustom);

  return (
    <div>
      <label className="label">Кому (имя сотрудника)</label>
      <select
        className="input"
        value={custom ? "__custom" : value}
        onChange={(e) => {
          if (e.target.value === "__custom") {
            setCustom(true);
            onChange("");
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Выберите сотрудника…
        </option>
        {employees.map((e) => (
          <option key={e._id} value={e.name}>
            {e.name}
          </option>
        ))}
        <option value="__custom">Другое…</option>
      </select>
      {custom && (
        <input
          className="input mt-1.5"
          placeholder="Имя сотрудника"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Расход — если создаёт владелец на сайте, сразу учитывается в остатке (см. app/api/expenses/route.ts).
 * Тип "salary" дополнительно просит имя сотрудника, кому заплатили.
 */
function ExpenseModal({
  containers,
  onClose,
  onSaved,
}: {
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<"owner_withdrawal" | "salary" | "other">("owner_withdrawal");
  const [containerId, setContainerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [employeeName, setEmployeeName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!containerId) {
      setError("Выберите контейнер");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, containerId, amount, method, employeeName, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <MinusCircle className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Новый расход
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Тип</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="owner_withdrawal">Снятие владельцем</option>
              <option value="salary">Зарплата сотруднику</option>
              <option value="other">Прочее</option>
            </select>
          </div>
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
          {type === "salary" && <EmployeeNameField value={employeeName} onChange={setEmployeeName} />}
          <div className="flex gap-3">
            <div className="flex-1">
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
            <div className="flex-1">
              <label className="label">Способ</label>
              {/* "Терминал" не принимается для расходов — только наличные/перечисление/карта
                  (см. lib/validation.ts::expensePaymentMethodEnum). */}
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Наличные</option>
                <option value="transfer">Перечисление (счёт-банк)</option>
                <option value="card">Карта (счёт-карта)</option>
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
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохранение…" : "Записать расход"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** «Приход на холодильник» — общий приход не по конкретному клиенту, но привязан к конкретному
 * контейнеру (holодильнику), только владелец. */
function GeneralIncomeModal({
  containers,
  onClose,
  onSaved,
}: {
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [containerId, setContainerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!containerId) {
      setError("Выберите контейнер");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/general-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, amount, method, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Приход на холодильник
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
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
          <div className="flex gap-3">
            <div className="flex-1">
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
            <div className="flex-1">
              <label className="label">Способ</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {SELECTABLE_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
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
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохранение…" : "Записать приход"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Полное редактирование уже внесённого платежа — раньше платёж можно было только создать.
 * Доступно независимо от способа оплаты (см. app/api/income/[id]/route.ts). clientId не
 * редактируется здесь — это идентификатор арендатора (см. models/Client.ts), для исправления
 * ФИО/ИНН/паспорта и т.п. служит редактирование карточки на странице "Арендаторы".
 */
function IncomeEditModal({
  income,
  containers,
  onClose,
  onSaved,
}: {
  income: IncomeEntry;
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialContainerId =
    income.containerId && typeof income.containerId === "object" ? income.containerId._id : income.containerId || "";
  const [ownerLabel, setOwnerLabel] = useState(income.ownerLabel);
  const [containerId, setContainerId] = useState(initialContainerId);
  const [cellNumber, setCellNumber] = useState(income.cellNumber ? String(income.cellNumber) : "");
  const [amount, setAmount] = useState(String(income.amount));
  const [method, setMethod] = useState(income.method);
  const [paidAt, setPaidAt] = useState(income.paidAt.slice(0, 10));
  const [note, setNote] = useState(income.note || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedContainer = containers.find((c) => c._id === containerId);
  const cellOptions = cellNumbersForCount(selectedContainer?.cellCount || DEFAULT_CELL_COUNT);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/income/${income._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerLabel,
          containerId,
          // Камера обязательна у новых платежей (см. lib/validation.ts::incomeCreateSchema), но
          // "снять" её при редактировании больше нельзя — не отправляем поле вовсе, если оно не
          // выбрано (undefined = "не менять"), чтобы не наткнуться на отказ схемы.
          ...(cellNumber ? { cellNumber: Number(cellNumber) } : {}),
          amount,
          method,
          paidAt,
          note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <Pencil className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Изменить платёж
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Владелец груза</label>
            <input className="input" value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Контейнер</label>
              <select
                className="input"
                value={containerId}
                onChange={(e) => {
                  setContainerId(e.target.value);
                  setCellNumber("");
                }}
              >
                {containers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Камера</label>
              <select className="input" value={cellNumber} onChange={(e) => setCellNumber(e.target.value)}>
                <option value="">{income.cellNumber ? "—" : "Не указана (можно проставить)"}</option>
                {cellOptions.map((n) => (
                  <option key={n} value={n}>
                    Камера {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
                {SELECTABLE_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
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
          {error && (
            <div className="alert-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Полное редактирование уже созданного расхода — независимо от способа оплаты и текущего
 * статуса (см. app/api/expenses/[id]/route.ts). Отдельно от подтверждения/отклонения заявки
 * (кнопки Check/X в таблице) — это правка самих полей.
 */
function ExpenseEditModal({
  expense,
  containers,
  onClose,
  onSaved,
}: {
  expense: ExpenseEntry;
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialContainerId =
    expense.containerId && typeof expense.containerId === "object" ? expense.containerId._id : expense.containerId || "";
  const [type, setType] = useState<"owner_withdrawal" | "salary" | "other">(expense.type);
  const [containerId, setContainerId] = useState(initialContainerId);
  const [amount, setAmount] = useState(String(expense.amount));
  const [method, setMethod] = useState(expense.method);
  const [employeeName, setEmployeeName] = useState(expense.employeeName || "");
  const [note, setNote] = useState(expense.note || "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!containerId) {
      setError("Выберите контейнер");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expense._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, containerId, amount, method, employeeName, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <Pencil className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Изменить расход
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Тип</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="owner_withdrawal">Снятие владельцем</option>
              <option value="salary">Зарплата сотруднику</option>
              <option value="other">Прочее</option>
            </select>
          </div>
          <div>
            <label className="label">Контейнер</label>
            <select className="input" value={containerId} onChange={(e) => setContainerId(e.target.value)} required>
              <option value="">{expense.containerId ? "—" : "Выберите контейнер"}</option>
              {containers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {type === "salary" && <EmployeeNameField value={employeeName} onChange={setEmployeeName} />}
          <div className="flex gap-3">
            <div className="flex-1">
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
            <div className="flex-1">
              <label className="label">Способ</label>
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Наличные</option>
                <option value="transfer">Перечисление (счёт-банк)</option>
                <option value="card">Карта (счёт-карта)</option>
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
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
