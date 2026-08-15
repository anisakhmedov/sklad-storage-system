"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, UserRound, Building2, TriangleAlert, Pencil, X, AlertCircle } from "lucide-react";

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
  productName: string;
  quantity: number;
  unit: string;
  tariff: { type: string; rate: number };
  contractNumber?: string;
  createdAt: string;
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

interface DebtRow {
  containerId: string;
  containerName: string;
  since: string;
  accrued: number;
  paid: number;
  balance: number;
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

export default function TenantDetailPage({ params }: { params: { clientId: string } }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  function loadDetail() {
    setLoading(true);
    fetch(`/api/tenants/${encodeURIComponent(params.clientId)}`)
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

  useEffect(() => {
    loadDetail();

    setHistoryLoading(true);
    fetch(`/api/tenants/${encodeURIComponent(params.clientId)}/history`)
      .then((r) => r.json())
      .then((d) => setHistory(d.events || []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.clientId]);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card">
          <p className="text-xs text-ink-400 mb-1">Начислено</p>
          <p className="text-xl font-semibold text-ink-900 tabular-nums">{money(detail.totals.accrued)} сум</p>
        </div>
        <div className="card">
          <p className="text-xs text-ink-400 mb-1">Оплачено</p>
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
          <h2 className="card-title">Задолженность по контейнерам</h2>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Контейнер</th>
              <th>С даты</th>
              <th>Начислено</th>
              <th>Оплачено</th>
              <th>Остаток</th>
            </tr>
          </thead>
          <tbody>
            {detail.debts.map((d) => (
              <tr key={d.containerId}>
                <td className="font-medium text-ink-800">{d.containerName}</td>
                <td className="text-ink-500">{new Date(d.since).toLocaleDateString("ru-RU")}</td>
                <td className="tabular-nums text-ink-500">{money(d.accrued)}</td>
                <td className="tabular-nums text-ink-500">{money(d.paid)}</td>
                <td className={`tabular-nums font-medium ${d.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {money(d.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Контейнер</th>
              <th>Товар</th>
              <th>Количество</th>
              <th>Тариф</th>
              <th>№ договора</th>
              <th>Сотрудник</th>
              <th>Изменено</th>
            </tr>
          </thead>
          <tbody>
            {detail.records.map((r) => (
              <tr key={r._id}>
                <td className="whitespace-nowrap text-ink-500">{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                <td className="text-ink-800">{r.containerId?.name || "—"}</td>
                <td className="text-ink-800">{r.productName}</td>
                <td className="tabular-nums text-ink-500">
                  {r.quantity} {UNIT_LABELS[r.unit] || r.unit}
                </td>
                <td className="text-ink-500">{r.tariff.rate} / {r.tariff.type}</td>
                <td className="text-ink-500">{r.contractNumber || "—"}</td>
                <td className="text-ink-500">{r.createdByEmployeeId?.name || "—"}</td>
                <td className="text-ink-500 whitespace-nowrap">
                  {r.editedAt ? `${r.editedBy || "?"} · ${new Date(r.editedAt).toLocaleDateString("ru-RU")}` : "—"}
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
            loadDetail();
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-ink-800 font-medium">{value}</dd>
    </div>
  );
}
