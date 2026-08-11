"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { TARIFF_TYPES, TARIFF_LABELS, isTariffCompatibleWithUnit, formatTariffText, TariffType } from "@/lib/tariff";
import { ownerKeyOf } from "@/lib/ownerKey";
import {
  ClipboardList,
  Search,
  FileText,
  Pencil,
  History,
  Trash2,
  X,
  PlusCircle,
  Pencil as PencilAlt,
  Ban,
} from "lucide-react";

interface ContainerRef {
  _id: string;
  name: string;
}
interface EmployeeRef {
  _id: string;
  name: string;
  phone: string;
}

interface GoodsOwnerIndividual {
  type: "individual";
  fullName: string;
  phone: string;
  passportData: string;
  pinfl: string;
  passportIssueDate: string;
  passportIssuedBy: string;
}
interface GoodsOwnerCompany {
  type: "company";
  companyName: string;
  inn: string;
  directorName: string;
}
type GoodsOwner = GoodsOwnerIndividual | GoodsOwnerCompany;

interface Record_ {
  _id: string;
  containerId: ContainerRef | string;
  productName: string;
  quantity: number;
  unit: string;
  goodsOwner: GoodsOwner;
  tariff: { type: TariffType; rate: number };
  createdByEmployeeId?: EmployeeRef | string;
  createdAt: string;
  editedBy?: string;
  editedAt?: string;
}

const unitLabels: Record<string, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };

const blankIndividual: GoodsOwnerIndividual = {
  type: "individual",
  fullName: "",
  phone: "",
  passportData: "",
  pinfl: "",
  passportIssueDate: "",
  passportIssuedBy: "",
};
const blankCompany: GoodsOwnerCompany = {
  type: "company",
  companyName: "",
  inn: "",
  directorName: "",
};

const actionMeta: Record<string, { label: string; icon: typeof PlusCircle; tone: string }> = {
  create: { label: "Создание", icon: PlusCircle, tone: "bg-emerald-100 text-emerald-700" },
  update: { label: "Изменение", icon: PencilAlt, tone: "bg-amber-100 text-amber-700" },
  delete: { label: "Удаление", icon: Ban, tone: "bg-rose-100 text-rose-700" },
};

export default function RecordsPage() {
  const [records, setRecords] = useState<Record_[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    containerId: "",
    product: "",
    tariffType: "",
    from: "",
    to: "",
  });
  const [editing, setEditing] = useState<Record_ | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<Record_ | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.containerId) params.set("containerId", filters.containerId);
    if (filters.product) params.set("product", filters.product);
    if (filters.tariffType) params.set("tariffType", filters.tariffType);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    const res = await fetch(`/api/records?${params.toString()}`);
    const data = await res.json();
    setRecords(data.records || []);
    setTotal(data.total || 0);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Удалить запись безвозвратно?")) return;
    await fetch(`/api/records/${id}`, { method: "DELETE" });
    await load();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/records/${editing._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: editing.productName,
          quantity: editing.quantity,
          unit: editing.unit,
          goodsOwner: editing.goodsOwner,
          tariff: editing.tariff,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.error || "Не удалось сохранить изменения");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  async function openHistory(rec: Record_) {
    setHistoryFor(rec);
    const res = await fetch(`/api/records/${rec._id}/audit`);
    const data = await res.json();
    setHistory(data.logs || []);
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="section-eyebrow">Журнал</p>
          <h1 className="section-title mt-1">
            Записи <span className="text-ink-300 font-normal">· {total}</span>
          </h1>
        </div>
      </div>

      <div className="card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="label">Контейнер</label>
            <select
              className="input"
              value={filters.containerId}
              onChange={(e) => setFilters({ ...filters, containerId: e.target.value })}
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
            <label className="label">Товар</label>
            <div className="input-icon-wrap">
              <Search className="input-icon h-4 w-4" strokeWidth={2} />
              <input
                className="input"
                value={filters.product}
                onChange={(e) => setFilters({ ...filters, product: e.target.value })}
                placeholder="поиск по названию"
              />
            </div>
          </div>
          <div>
            <label className="label">Тип тарифа</label>
            <select
              className="input"
              value={filters.tariffType}
              onChange={(e) => setFilters({ ...filters, tariffType: e.target.value })}
            >
              <option value="">Все</option>
              {TARIFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TARIFF_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">С даты</label>
            <input
              type="date"
              className="input"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </div>
          <div>
            <label className="label">По дату</label>
            <input
              type="date"
              className="input"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ClipboardList className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Записей не найдено.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Контейнер</th>
                <th>Товар</th>
                <th>Кол-во</th>
                <th>Владелец груза</th>
                <th>Тариф</th>
                <th>Сотрудник</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r._id}>
                  <td className="whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString("ru-RU")}
                    {r.editedAt && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        изменено {new Date(r.editedAt).toLocaleDateString("ru-RU")}
                      </div>
                    )}
                  </td>
                  <td>{typeof r.containerId === "object" ? r.containerId.name : r.containerId}</td>
                  <td className="font-medium text-ink-800">{r.productName}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {r.quantity} {unitLabels[r.unit]}
                  </td>
                  <td>
                    {r.goodsOwner.type === "individual" ? (
                      <>
                        <Link
                          href={`/dashboard/tenants/${encodeURIComponent(ownerKeyOf(r.goodsOwner))}`}
                          className="text-ink-800 hover:text-brand-600 font-medium"
                        >
                          {r.goodsOwner.fullName}
                        </Link>
                        <div className="text-xs text-ink-400">{r.goodsOwner.phone}</div>
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/dashboard/tenants/${encodeURIComponent(ownerKeyOf(r.goodsOwner))}`}
                          className="text-ink-800 hover:text-brand-600 font-medium"
                        >
                          {r.goodsOwner.companyName}
                        </Link>
                        <div className="text-xs text-ink-400">
                          ИНН {r.goodsOwner.inn} · дир. {r.goodsOwner.directorName}
                        </div>
                      </>
                    )}
                    <span
                      className={`badge mt-1 ${
                        r.goodsOwner.type === "individual"
                          ? "bg-brand-50 text-brand-700"
                          : "bg-ink-100 text-ink-600"
                      }`}
                    >
                      {r.goodsOwner.type === "individual" ? "физ. лицо" : "юр. лицо"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{formatTariffText(r.tariff)}</td>
                  <td className="text-ink-500">
                    {typeof r.createdByEmployeeId === "object"
                      ? r.createdByEmployeeId?.name
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {r.goodsOwner.type === "individual" && (
                        <a
                          className="btn-icon btn-secondary"
                          href={`/api/records/${r._id}/contract`}
                          target="_blank"
                          rel="noreferrer"
                          title="Договор"
                        >
                          <FileText className="h-3.5 w-3.5" strokeWidth={2} />
                        </a>
                      )}
                      <button
                        className="btn-icon btn-secondary"
                        title="Изменить"
                        onClick={() => {
                          setEditError(null);
                          setEditing(r);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button className="btn-icon btn-secondary" title="История" onClick={() => openHistory(r)}>
                        <History className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button className="btn-icon btn-danger-ghost" title="Удалить" onClick={() => handleDelete(r._id)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="modal-backdrop overflow-y-auto py-8" onClick={() => setEditing(null)}>
          <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="card-title">Редактирование записи</h3>
              <button className="btn-icon btn-ghost" onClick={() => setEditing(null)} aria-label="Закрыть">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Товар</label>
                  <input
                    className="input"
                    value={editing.productName}
                    onChange={(e) => setEditing({ ...editing, productName: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="label">Кол-во</label>
                    <input
                      type="number"
                      className="input"
                      value={editing.quantity}
                      onChange={(e) =>
                        setEditing({ ...editing, quantity: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label">Ед.</label>
                    <select
                      className="input"
                      value={editing.unit}
                      onChange={(e) => {
                        const unit = e.target.value;
                        const stillCompatible = isTariffCompatibleWithUnit(editing.tariff.type, unit as any);
                        setEditing({
                          ...editing,
                          unit,
                          tariff: stillCompatible ? editing.tariff : { ...editing.tariff, type: "per_day" },
                        });
                      }}
                    >
                      <option value="tonne">тонны</option>
                      <option value="kg">кг</option>
                      <option value="box">ящики</option>
                      <option value="piece">штуки</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-sm font-medium text-ink-600">Владелец груза</p>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${
                      editing.goodsOwner.type === "individual"
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-ink-200 text-ink-500 hover:bg-ink-50"
                    }`}
                    onClick={() => setEditing({ ...editing, goodsOwner: { ...blankIndividual } })}
                  >
                    Физ. лицо
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2.5 py-1.5 border font-medium transition-colors ${
                      editing.goodsOwner.type === "company"
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-ink-200 text-ink-500 hover:bg-ink-50"
                    }`}
                    onClick={() => setEditing({ ...editing, goodsOwner: { ...blankCompany } })}
                  >
                    Юр. лицо
                  </button>
                </div>
              </div>

              {editing.goodsOwner.type === "individual" ? (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="input"
                    placeholder="ФИО"
                    value={editing.goodsOwner.fullName}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, fullName: e.target.value } as GoodsOwnerIndividual,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="Телефон"
                    value={editing.goodsOwner.phone}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, phone: e.target.value } as GoodsOwnerIndividual,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="Номер паспорта"
                    value={editing.goodsOwner.passportData}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, passportData: e.target.value } as GoodsOwnerIndividual,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="ПИНФЛ"
                    value={editing.goodsOwner.pinfl}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, pinfl: e.target.value } as GoodsOwnerIndividual,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="Дата выдачи паспорта"
                    value={editing.goodsOwner.passportIssueDate}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: {
                          ...editing.goodsOwner,
                          passportIssueDate: e.target.value,
                        } as GoodsOwnerIndividual,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="Кем выдан паспорт"
                    value={editing.goodsOwner.passportIssuedBy}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: {
                          ...editing.goodsOwner,
                          passportIssuedBy: e.target.value,
                        } as GoodsOwnerIndividual,
                      })
                    }
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="input col-span-2"
                    placeholder="Наименование фирмы"
                    value={editing.goodsOwner.companyName}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, companyName: e.target.value } as GoodsOwnerCompany,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="ИНН"
                    value={editing.goodsOwner.inn}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, inn: e.target.value } as GoodsOwnerCompany,
                      })
                    }
                  />
                  <input
                    className="input"
                    placeholder="Имя и фамилия директора"
                    value={editing.goodsOwner.directorName}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        goodsOwner: { ...editing.goodsOwner, directorName: e.target.value } as GoodsOwnerCompany,
                      })
                    }
                  />
                </div>
              )}

              <p className="text-sm font-medium text-ink-600 pt-2">Тариф</p>
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="input"
                  value={editing.tariff.type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tariff: { ...editing.tariff, type: e.target.value as TariffType },
                    })
                  }
                >
                  {TARIFF_TYPES.filter((t) => isTariffCompatibleWithUnit(t, editing.unit as any)).map((t) => (
                    <option key={t} value={t}>
                      {TARIFF_LABELS[t]}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input"
                  placeholder="Ставка, сум"
                  value={editing.tariff.rate}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tariff: { ...editing.tariff, rate: Number(e.target.value) },
                    })
                  }
                />
              </div>

              {editError && <div className="alert-danger">{editError}</div>}
              <div className="flex gap-2 pt-2">
                <button className="btn-primary" disabled={editBusy}>
                  {editBusy ? "Сохранение…" : "Сохранить"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setEditError(null);
                    setEditing(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="modal-backdrop overflow-y-auto py-8" onClick={() => setHistoryFor(null)}>
          <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="card-title">История изменений</h3>
                <p className="card-subtitle">{historyFor.productName}</p>
              </div>
              <button className="btn-icon btn-ghost" onClick={() => setHistoryFor(null)} aria-label="Закрыть">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            {history.length === 0 ? (
              <div className="empty-state py-8">
                <div className="empty-state-icon">
                  <History className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <p className="text-sm text-ink-500">Изменений не зафиксировано.</p>
              </div>
            ) : (
              <div className="space-y-0 max-h-96 overflow-y-auto -mr-1 pr-1">
                {history.map((h, idx) => {
                  const meta = actionMeta[h.action] || actionMeta.update;
                  const Icon = meta.icon;
                  return (
                    <div key={h._id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}>
                          <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
                        </div>
                        {idx < history.length - 1 && <div className="w-px flex-1 bg-ink-100 my-1" />}
                      </div>
                      <div className="flex-1 min-w-0 pb-4">
                        <div className="flex justify-between items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-ink-800">{meta.label}</span>
                          <span className="text-xs text-ink-400 whitespace-nowrap">
                            {new Date(h.timestamp).toLocaleString("ru-RU")}
                          </span>
                        </div>
                        <div className="text-xs text-ink-400 mb-1.5">
                          {h.actorId} · {h.actorRole}
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs text-ink-600 bg-ink-50 rounded-lg border border-ink-100 p-2.5">
                          {JSON.stringify(h.changes, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
