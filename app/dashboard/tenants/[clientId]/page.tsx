"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  UserRound,
  Building2,
  TriangleAlert,
  Pencil,
  X,
  AlertCircle,
  Trash2,
  Lock,
  Unlock,
  ChevronDown,
  CalendarClock,
} from "lucide-react";
import {
  TARIFF_TYPES,
  TARIFF_LABELS,
  isTariffCompatibleWithUnit,
  suggestedEndDate,
  formatTariffText,
  TariffType,
} from "@/lib/tariff";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "@/lib/cells";

type OwnerType = "individual" | "company";
type GoodsOwner =
  | {
      type: "individual";
      fullName: string;
      phone: string;
      passportData: string;
      pinfl: string;
      passportIssueDate: string;
      passportIssuedBy: string;
    }
  | { type: "company"; companyName: string; inn: string; directorName: string };

interface RecordRow {
  _id: string;
  containerId: { _id: string; name: string } | null;
  cellNumber: number;
  productName: string;
  quantity: number;
  unit: string;
  tariff: { type: TariffType; rate: number };
  contractNumber?: string;
  createdAt: string;
  expectedEndDate?: string;
  closedAt?: string;
  closedBy?: string;
  createdByEmployeeId: { _id: string; name: string; phone: string } | null;
  editedBy?: string;
  editedAt?: string;
}

interface IncomeRow {
  _id: string;
  containerId: { _id: string; name: string } | null;
  amount: number;
  method: string;
  paidAt: string;
  note?: string;
  recordedBy: string;
}

interface ContainerRef {
  _id: string;
  name: string;
  cellCount?: number;
}

interface DebtRecordBreakdown {
  recordId: string;
  productName: string;
  quantity: number;
  unit: string;
  tariff: { type: string; rate: number };
  since: string;
  accrued: number;
  closedAt?: string;
}

/** Долг по ОДНОЙ камере одного контейнера — самая мелкая единица разбивки (см. lib/debt.ts). */
interface DebtCellRow {
  containerId: string;
  containerName: string;
  cellNumber: number;
  since: string;
  accrued: number;
  paid: number;
  balance: number;
  records: DebtRecordBreakdown[];
}

/** Долг по контейнеру целиком — сумма по всем его камерам, плюс сами камеры (cells) для
 * разбивки (см. lib/debt.ts::ClientContainerDebt). */
interface DebtRow {
  containerId: string;
  containerName: string;
  since: string;
  accrued: number;
  paid: number;
  balance: number;
  cells: DebtCellRow[];
}

interface Detail {
  clientId: string;
  ownerType: OwnerType;
  profile: GoodsOwner;
  telegram: { telegramId: string; linkedAt: string } | null;
  records: RecordRow[];
  incomes: IncomeRow[];
  debts: DebtRow[];
  totals: { accrued: number; paid: number; balance: number };
}

interface HistoryEvent {
  kind: string;
  date: string;
  containerName: string;
  cellNumber?: number;
  itemLabel: string;
  quantityText?: string;
  amount?: number;
  method?: string;
  note?: string;
  actId?: string;
  actNumber?: string;
  createdBy: string;
}

const UNIT_LABELS: Record<string, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };
const METHOD_LABELS: Record<string, string> = { cash: "Наличные", terminal: "Терминал", transfer: "Перевод", card: "Карта (П2П)" };
const HISTORY_KIND_LABELS: Record<string, { label: string; tone: string }> = {
  goods_given: { label: "Приём товара", tone: "bg-emerald-100 text-emerald-700" },
  goods_returned: { label: "Отдача товара", tone: "bg-amber-100 text-amber-700" },
  inventory_given: { label: "Выдача инвентаря", tone: "bg-sky-100 text-sky-700" },
  inventory_returned: { label: "Возврат инвентаря", tone: "bg-sky-100 text-sky-700" },
  payment: { label: "Оплата", tone: "bg-brand-50 text-brand-700" },
};
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const todayInput = () => new Date().toISOString().slice(0, 10);

export default function TenantDetailPage({ params }: { params: { clientId: string } }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  // Правка/закрытие записей ("Записи") — тот же набор операций, что и на странице «Записи»
  // (см. app/dashboard/records/page.tsx), плюс контейнер/камера, которых там в форме нет:
  // здесь это нужно в первую очередь — сменить арендатору камеру, не пересоздавая запись.
  const [editingRecord, setEditingRecord] = useState<RecordRow | null>(null);
  const [closingRecord, setClosingRecord] = useState<RecordRow | null>(null);
  // На какую дату считать задолженность (см. lib/debt.ts) — по умолчанию сегодня. Меняя её,
  // можно посмотреть, сколько клиент был должен на любой прошлый момент (§ «Сводка
  // задолженности» ниже) — начисление считается с даты каждой записи ПО эту дату включительно.
  const [debtToDate, setDebtToDate] = useState(todayInput());
  // Раскрытые строки разбивки по камерам (ключ containerId::cellNumber) — какие детали записей
  // сейчас развёрнуты под строкой камеры.
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  function loadDetail() {
    setLoading(true);
    const params_ = new URLSearchParams();
    if (debtToDate) params_.set("to", debtToDate);
    fetch(`/api/tenants/${encodeURIComponent(params.clientId)}?${params_.toString()}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(d.error || "Ошибка");
          return;
        }
        setDetail(d.detail);
      })
      .catch(() => setError("Не удалось связаться с сервером"))
      .finally(() => setLoading(false));
  }

  function loadHistory() {
    setHistoryLoading(true);
    fetch(`/api/tenants/${encodeURIComponent(params.clientId)}/history`)
      .then((r) => r.json())
      .then((d) => setHistory(d.events || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  function reload() {
    loadDetail();
    loadHistory();
  }

  useEffect(() => {
    loadDetail();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.clientId]);

  // Пересчитывает только задолженность (loadDetail) — журнал операций (история) от выбранной
  // даты не зависит, перезапрашивать его незачем.
  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtToDate]);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []))
      .catch(() => {});
  }, []);

  function toggleCell(key: string) {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Плоский список "камера в контейнере" по всем контейнерам клиента, отсортированный так же,
  // как в детализации TenantMatrixTable — сначала контейнер, потом номер камеры.
  const cellRows = useMemo(() => {
    if (!detail) return [];
    return detail.debts
      .flatMap((d) => d.cells)
      .sort((a, b) => a.containerName.localeCompare(b.containerName, "ru") || a.cellNumber - b.cellNumber);
  }, [detail]);

  async function handleDeleteIncome(inc: IncomeRow) {
    if (!confirm(`Удалить платёж на сумму ${money(inc.amount)} сум? Это действие необратимо.`)) return;
    await fetch(`/api/income/${inc._id}`, { method: "DELETE" });
    reload();
  }

  async function handleDeleteRecord(rec: RecordRow) {
    if (!confirm(`Удалить запись «${rec.productName}» безвозвратно? Оплаты по ней останутся, но запись пропадёт из истории размещения.`)) return;
    await fetch(`/api/records/${rec._id}`, { method: "DELETE" });
    reload();
  }

  async function handleReopenRecord(rec: RecordRow) {
    if (!confirm("Открыть запись заново? Начисление тарифа продолжится.")) return;
    await fetch(`/api/records/${rec._id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closedAt: null }),
    });
    reload();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="card h-64 skeleton" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon bg-rose-100 text-rose-600">
          <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-sm text-rose-600">{error || "Арендатор не найден"}</p>
      </div>
    );
  }

  const OwnerIcon = detail.ownerType === "individual" ? UserRound : Building2;
  const label = detail.profile.type === "individual" ? detail.profile.fullName : detail.profile.companyName;

  return (
    <div>
      <Link href="/dashboard/tenants" className="inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-700 mb-4">
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        К списку арендаторов
      </Link>

      <div className="flex items-center justify-between mb-7 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <OwnerIcon className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div>
            <h1 className="section-title">{label}</h1>
            <p className="text-sm text-ink-400">{detail.ownerType === "individual" ? "Физическое лицо" : "Юридическое лицо"}</p>
          </div>
        </div>
        <a href={`/api/tenants/${encodeURIComponent(params.clientId)}/export`} className="btn-primary">
          <Download className="h-4 w-4" strokeWidth={2.1} />
          Скачать Excel
        </a>
      </div>

      <div className="mb-3 flex items-end justify-between flex-wrap gap-2">
        <p className="text-sm text-ink-400 max-w-lg leading-relaxed">
          Начисление считается по тарифу с даты каждой записи по выбранную дату включительно —
          поменяйте дату, чтобы посмотреть, сколько клиент должен был на любой прошлый момент.
        </p>
        <div className="flex items-end gap-2">
          <div>
            <label className="label">Задолженность на дату</label>
            <div className="input-icon-wrap">
              <CalendarClock className="input-icon h-4 w-4" strokeWidth={2} />
              <input
                type="date"
                className="input"
                value={debtToDate}
                onChange={(e) => setDebtToDate(e.target.value)}
              />
            </div>
          </div>
          <button className="btn-secondary" onClick={() => setDebtToDate(todayInput())}>
            Сегодня
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-ink-400 mb-1">Начислено{debtToDate && debtToDate !== todayInput() ? ` на ${new Date(debtToDate).toLocaleDateString("ru-RU")}` : ""}</p>
          <p className="text-xl font-semibold text-ink-900 tabular-nums">{money(detail.totals.accrued)} сум</p>
        </div>
        <div className="card">
          <p className="text-xs text-ink-400 mb-1">Оплачено{debtToDate && debtToDate !== todayInput() ? ` до ${new Date(debtToDate).toLocaleDateString("ru-RU")}` : ""}</p>
          <p className="text-xl font-semibold text-ink-900 tabular-nums">{money(detail.totals.paid)} сум</p>
        </div>
        <div className="card">
          <p className="text-xs text-ink-400 mb-1">Задолженность</p>
          <p className={`text-xl font-semibold tabular-nums ${detail.totals.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {money(detail.totals.balance)} сум
          </p>
        </div>
      </div>

      <div className="card mb-8">
        <div className="card-header">
          <h2 className="card-title">Профиль</h2>
          <button className="btn-secondary btn-sm" onClick={() => setEditingProfile(true)}>
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
            Изменить
          </button>
        </div>
        {detail.profile.type === "individual" ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <Field label="ФИО" value={detail.profile.fullName} />
            <Field label="Телефон" value={detail.profile.phone} />
            <Field label="Паспорт" value={detail.profile.passportData} />
            <Field label="Дата выдачи" value={detail.profile.passportIssueDate} />
            <Field label="Кем выдан" value={detail.profile.passportIssuedBy} />
            <Field label="ПИНФЛ" value={detail.profile.pinfl} />
          </dl>
        ) : (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <Field label="Наименование" value={detail.profile.companyName} />
            <Field label="ИНН" value={detail.profile.inn} />
            <Field label="Директор" value={detail.profile.directorName} />
          </dl>
        )}
        {detail.telegram && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm mt-3 pt-3 border-t border-ink-100">
            <Field label="Telegram ID" value={detail.telegram.telegramId} />
            <Field label="Привязан к боту с" value={new Date(detail.telegram.linkedAt).toLocaleString("ru-RU")} />
          </dl>
        )}
      </div>

      <div className="card mb-8 overflow-x-auto">
        <div className="card-header">
          <h2 className="card-title">Сводка задолженности по камерам ({cellRows.length})</h2>
          <p className="card-subtitle">
            Разбивка до камеры, а не только по контейнеру в целом — раскройте строку, чтобы
            увидеть начисление по каждой записи внутри камеры.
          </p>
        </div>
        {cellRows.length === 0 ? (
          <div className="empty-state">
            <p className="text-sm text-ink-500">Записей о размещении товара пока нет.</p>
          </div>
        ) : (
          <>
            <table className="table-base">
              <thead>
                <tr>
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
                {cellRows.map((c) => {
                  const key = `${c.containerId}::${c.cellNumber}`;
                  const isOpen = expandedCells.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className="cursor-pointer" onClick={() => toggleCell(key)}>
                        <td className="font-medium text-ink-800">{c.containerName}</td>
                        <td className="text-ink-600">Камера {c.cellNumber}</td>
                        <td className="whitespace-nowrap text-ink-500">{new Date(c.since).toLocaleDateString("ru-RU")}</td>
                        <td className="tabular-nums text-ink-500">{money(c.accrued)}</td>
                        <td className="tabular-nums text-ink-500">{money(c.paid)}</td>
                        <td className={`tabular-nums font-medium ${c.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {money(c.balance)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-icon btn-ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCell(key);
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
                          <td colSpan={7} className="bg-ink-50/70">
                            <div className="text-xs text-ink-600 py-2.5 space-y-1.5">
                              {c.records.map((r) => (
                                <div key={r.recordId} className="flex justify-between gap-4">
                                  <span>
                                    {r.productName} · {r.quantity} {UNIT_LABELS[r.unit] || r.unit} · с{" "}
                                    {new Date(r.since).toLocaleDateString("ru-RU")}
                                    {r.closedAt && ` · закрыта ${new Date(r.closedAt).toLocaleDateString("ru-RU")}`}
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
              <tfoot>
                <tr className="font-semibold border-t-2 border-ink-200">
                  <td colSpan={3} className="text-ink-700">Итого</td>
                  <td className="tabular-nums">{money(detail.totals.accrued)}</td>
                  <td className="tabular-nums">{money(detail.totals.paid)}</td>
                  <td className={`tabular-nums ${detail.totals.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {money(detail.totals.balance)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </div>

      <div className="card mb-8 overflow-x-auto">
        <div className="card-header">
          <h2 className="card-title">История операций ({history.length})</h2>
          <p className="card-subtitle">Приём/отдача товара, выдача/возврат инвентаря, оплаты — в одной ленте по времени.</p>
        </div>
        {historyLoading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state py-6">
            <p className="text-sm text-ink-500">Операций пока не было.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Контейнер</th>
                <th>Камера</th>
                <th>Что</th>
                <th>Кол-во / Сумма</th>
                <th>Кто оформил</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => {
                const meta = HISTORY_KIND_LABELS[h.kind] || { label: h.kind, tone: "bg-ink-100 text-ink-600" };
                return (
                  <tr key={idx}>
                    <td className="whitespace-nowrap text-ink-500">{new Date(h.date).toLocaleString("ru-RU")}</td>
                    <td>
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                    </td>
                    <td className="text-ink-800">{h.containerName}</td>
                    <td className="text-ink-600">{h.cellNumber ?? "—"}</td>
                    <td className="text-ink-800">
                      {h.itemLabel}
                      {h.note && <div className="text-xs text-ink-400 max-w-xs truncate">{h.note}</div>}
                    </td>
                    <td className="tabular-nums text-ink-800">
                      {h.kind === "payment" ? `${money(h.amount || 0)} сум${h.method ? ` · ${METHOD_LABELS[h.method] || h.method}` : ""}` : h.quantityText || "—"}
                    </td>
                    <td className="text-ink-500">{h.createdBy}</td>
                    <td className="whitespace-nowrap">
                      {h.actId && (
                        <a
                          className="btn-icon btn-secondary"
                          href={`/api/acts/${h.actId}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title={`Акт ${h.actNumber || ""}`}
                        >
                          <Download className="h-3.5 w-3.5" strokeWidth={2} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mb-8 overflow-x-auto">
        <div className="card-header">
          <h2 className="card-title">Записи ({detail.records.length})</h2>
          <p className="card-subtitle">
            Камера, тариф, дата заезда и дата отъезда (закрытие) редактируются здесь же — кнопки справа в строке.
          </p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Пришёл</th>
              <th>Ушёл</th>
              <th>Контейнер</th>
              <th>Камера</th>
              <th>Товар</th>
              <th>Количество</th>
              <th>Тариф</th>
              <th>№ договора</th>
              <th>Сотрудник</th>
              <th>Изменено</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.records.map((r) => (
              <tr key={r._id} className={r.closedAt ? "opacity-60" : undefined}>
                <td className="whitespace-nowrap text-ink-500">{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                <td className="whitespace-nowrap">
                  {r.closedAt ? (
                    <span className="badge bg-rose-100 text-rose-700">
                      {new Date(r.closedAt).toLocaleDateString("ru-RU")}
                    </span>
                  ) : r.expectedEndDate ? (
                    <span className="text-ink-400">~{new Date(r.expectedEndDate).toLocaleDateString("ru-RU")}</span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                </td>
                <td className="text-ink-800">{r.containerId?.name || "—"}</td>
                <td className="text-ink-600">{r.cellNumber ?? "—"}</td>
                <td className="text-ink-800">{r.productName}</td>
                <td className="tabular-nums text-ink-500">
                  {r.quantity} {UNIT_LABELS[r.unit] || r.unit}
                </td>
                <td className="text-ink-500 whitespace-nowrap">{r.tariff ? formatTariffText(r.tariff) : "—"}</td>
                <td className="text-ink-500">{r.contractNumber || "—"}</td>
                <td className="text-ink-500">{r.createdByEmployeeId?.name || "—"}</td>
                <td className="text-ink-500 whitespace-nowrap">
                  {r.editedAt ? `${r.editedBy || "?"} · ${new Date(r.editedAt).toLocaleDateString("ru-RU")}` : "—"}
                </td>
                <td className="whitespace-nowrap">
                  <div className="flex justify-end gap-1.5">
                    <button
                      className="btn-icon btn-secondary"
                      title="Изменить (камера, тариф, даты и т.д.)"
                      onClick={() => setEditingRecord(r)}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                    {r.closedAt ? (
                      <button
                        className="btn-icon btn-secondary"
                        title="Открыть заново"
                        onClick={() => handleReopenRecord(r)}
                      >
                        <Unlock className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    ) : (
                      <button
                        className="btn-icon btn-secondary"
                        title="Закрыть (клиент ушёл, товар забрал)"
                        onClick={() => setClosingRecord(r)}
                      >
                        <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                    <button
                      className="btn-icon btn-danger-ghost"
                      title="Удалить запись"
                      onClick={() => handleDeleteRecord(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="card-header">
          <h2 className="card-title">Оплаты ({detail.incomes.length})</h2>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Контейнер</th>
              <th>Сумма</th>
              <th>Способ</th>
              <th>Примечание</th>
              <th>Зафиксировал</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {detail.incomes.map((inc) => (
              <tr key={inc._id}>
                <td className="whitespace-nowrap text-ink-500">{new Date(inc.paidAt).toLocaleString("ru-RU")}</td>
                <td className="text-ink-800">{inc.containerId?.name || "—"}</td>
                <td className="tabular-nums text-ink-800">{money(inc.amount)}</td>
                <td className="text-ink-500">{METHOD_LABELS[inc.method] || inc.method}</td>
                <td className="text-ink-500 max-w-xs truncate">{inc.note || "—"}</td>
                <td className="text-ink-500">{inc.recordedBy}</td>
                <td className="whitespace-nowrap">
                  <button
                    className="btn-icon btn-danger-ghost"
                    title="Удалить платёж"
                    onClick={() => handleDeleteIncome(inc)}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingProfile && (
        <TenantProfileEditModal
          clientId={params.clientId}
          profile={detail.profile}
          onClose={() => setEditingProfile(false)}
          onSaved={() => {
            setEditingProfile(false);
            reload();
          }}
        />
      )}

      {editingRecord && (
        <RecordEditModal
          record={editingRecord}
          containers={containers}
          onClose={() => setEditingRecord(null)}
          onSaved={() => {
            setEditingRecord(null);
            reload();
          }}
        />
      )}

      {closingRecord && (
        <RecordCloseModal
          record={closingRecord}
          onClose={() => setClosingRecord(null)}
          onSaved={() => {
            setClosingRecord(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

/**
 * Правка карточки арендатора — теперь правит ОДИН документ Client (models/Client.ts), см.
 * app/api/tenants/[clientId]/route.ts. Тип (физ./юр. лицо) не редактируется здесь — он задан
 * профилем, который уже есть.
 */
function TenantProfileEditModal({
  clientId,
  profile,
  onClose,
  onSaved,
}: {
  clientId: string;
  profile: GoodsOwner;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<GoodsOwner>(profile);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(clientId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
    <div className="modal-backdrop overflow-y-auto py-8" onClick={onClose}>
      <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title">Редактирование арендатора</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-xs text-ink-400 mb-3">
          Правится карточка этого клиента целиком (см. «Клиенты» в базе) — печатные снимки уже
          выданных документов не меняются задним числом.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {form.type === "individual" ? (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input"
                placeholder="ФИО"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
              <input
                className="input"
                placeholder="Телефон"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <input
                className="input"
                placeholder="Номер паспорта"
                value={form.passportData}
                onChange={(e) => setForm({ ...form, passportData: e.target.value })}
              />
              <input
                className="input"
                placeholder="ПИНФЛ"
                value={form.pinfl}
                onChange={(e) => setForm({ ...form, pinfl: e.target.value })}
              />
              <input
                className="input"
                placeholder="Дата выдачи паспорта"
                value={form.passportIssueDate}
                onChange={(e) => setForm({ ...form, passportIssueDate: e.target.value })}
              />
              <input
                className="input"
                placeholder="Кем выдан паспорт"
                value={form.passportIssuedBy}
                onChange={(e) => setForm({ ...form, passportIssuedBy: e.target.value })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input col-span-2"
                placeholder="Наименование фирмы"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
              <input
                className="input"
                placeholder="ИНН"
                value={form.inn}
                onChange={(e) => setForm({ ...form, inn: e.target.value })}
              />
              <input
                className="input"
                placeholder="Имя и фамилия директора"
                value={form.directorName}
                onChange={(e) => setForm({ ...form, directorName: e.target.value })}
              />
            </div>
          )}

          {error && (
            <div className="alert-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
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
 * Полное редактирование записи размещения — контейнер/камера, товар, количество, тариф и
 * даты (заезд/ориентировочный отъезд). Отдельно от закрытия записи (RecordCloseModal ниже) —
 * фактическая дата отъезда (closedAt) требует отдельного подтверждения, т.к. останавливает
 * начисление тарифа, см. app/api/records/[id]/close/route.ts.
 */
function RecordEditModal({
  record,
  containers,
  onClose,
  onSaved,
}: {
  record: RecordRow;
  containers: ContainerRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [containerId, setContainerId] = useState(record.containerId?._id || "");
  const [cellNumber, setCellNumber] = useState(String(record.cellNumber ?? ""));
  const [productName, setProductName] = useState(record.productName);
  const [quantity, setQuantity] = useState(String(record.quantity));
  const [unit, setUnit] = useState(record.unit);
  const [tariffType, setTariffType] = useState<TariffType>(record.tariff.type);
  const [tariffRate, setTariffRate] = useState(String(record.tariff.rate));
  const [createdAt, setCreatedAt] = useState(record.createdAt.slice(0, 10));
  const [expectedEndDate, setExpectedEndDate] = useState(record.expectedEndDate ? record.expectedEndDate.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedContainer = containers.find((c) => c._id === containerId);
  const cellOptions = cellNumbersForCount(selectedContainer?.cellCount || DEFAULT_CELL_COUNT);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/records/${record._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId,
          cellNumber,
          productName,
          quantity,
          unit,
          tariff: { type: tariffType, rate: tariffRate },
          createdAt: new Date(createdAt).toISOString(),
          ...(expectedEndDate ? { expectedEndDate: new Date(expectedEndDate).toISOString() } : {}),
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
    <div className="modal-backdrop overflow-y-auto py-8" onClick={onClose}>
      <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title">Редактирование записи</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
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
                <option value="">Выберите камеру</option>
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
              <label className="label">Товар</label>
              <input className="input" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label">Кол-во</label>
                <input
                  type="number"
                  className="input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="label">Ед.</label>
                <select
                  className="input"
                  value={unit}
                  onChange={(e) => {
                    const newUnit = e.target.value;
                    setUnit(newUnit);
                    if (!isTariffCompatibleWithUnit(tariffType, newUnit as any)) setTariffType("per_day");
                  }}
                >
                  <option value="kg">кг</option>
                  <option value="tonne">тонны</option>
                  <option value="box">ящики</option>
                  <option value="piece">штуки</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Дата заезда (когда пришёл)</label>
            <input
              type="date"
              className="input"
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
            />
            <p className="text-xs text-ink-400 mt-1">От этой даты считается начисление по тарифу.</p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="label mb-0">Ориентировочная дата отъезда</label>
              <button
                type="button"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
                onClick={() => {
                  const suggestion = suggestedEndDate(tariffType, new Date(createdAt));
                  if (suggestion) setExpectedEndDate(suggestion.toISOString().slice(0, 10));
                }}
              >
                Подставить по тарифу
              </button>
            </div>
            <input
              type="date"
              className="input"
              value={expectedEndDate}
              onChange={(e) => setExpectedEndDate(e.target.value)}
            />
            <p className="text-xs text-ink-400 mt-1">
              Ориентир, не влияет на начисление. Фактический отъезд — кнопка «Закрыть» в таблице.
            </p>
          </div>

          <p className="text-sm font-medium text-ink-600 pt-2">Тариф</p>
          <div className="grid grid-cols-2 gap-3">
            <select
              className="input"
              value={tariffType}
              onChange={(e) => setTariffType(e.target.value as TariffType)}
            >
              {TARIFF_TYPES.filter((t) => isTariffCompatibleWithUnit(t, unit as any)).map((t) => (
                <option key={t} value={t}>
                  {TARIFF_LABELS[t]}
                </option>
              ))}
            </select>
            <input
              type="number"
              className="input"
              placeholder="Ставка, сум"
              value={tariffRate}
              onChange={(e) => setTariffRate(e.target.value)}
            />
          </div>

          {error && (
            <div className="alert-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-2 pt-2">
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
 * Закрытие записи ("товар забран", клиент фактически съехал) — отдельная узкая форма, просит
 * только дату (см. lib/validation.ts::storageRecordCloseSchema). Останавливает начисление
 * тарифа на эту дату; переоткрытие — без формы (handleReopenRecord).
 */
function RecordCloseModal({
  record,
  onClose,
  onSaved,
}: {
  record: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [closeDate, setCloseDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/records/${record._id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closedAt: new Date(closeDate).toISOString() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось закрыть запись");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop overflow-y-auto py-8" onClick={onClose}>
      <div className="modal-panel w-full max-w-sm my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title">Закрыть запись</h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-3">
          «{record.productName}» — начисление тарифа остановится на указанную дату, запись
          пропадёт из сводной таблицы «Арендаторы» и уйдёт в историю.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">Дата закрытия (товар забран)</label>
            <input
              type="date"
              className="input"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              required
            />
          </div>
          {error && <div className="alert-danger">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Сохранение…" : "Закрыть запись"}
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-ink-800 font-medium">{value}</dd>
    </div>
  );
}
