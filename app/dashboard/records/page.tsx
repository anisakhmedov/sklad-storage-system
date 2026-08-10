"use client";

import { useEffect, useState, useCallback } from "react";
import { TARIFF_TYPES, TARIFF_LABELS, isTariffCompatibleWithUnit, formatTariffText, TariffType } from "@/lib/tariff";

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
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Записи ({total})</h1>

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
            <input
              className="input"
              value={filters.product}
              onChange={(e) => setFilters({ ...filters, product: e.target.value })}
              placeholder="поиск по названию"
            />
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
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-slate-500">Записей не найдено.</p>
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
                      <div className="text-xs text-amber-600">
                        изменено {new Date(r.editedAt).toLocaleDateString("ru-RU")}
                      </div>
                    )}
                  </td>
                  <td>{typeof r.containerId === "object" ? r.containerId.name : r.containerId}</td>
                  <td>{r.productName}</td>
                  <td className="whitespace-nowrap">
                    {r.quantity} {unitLabels[r.unit]}
                  </td>
                  <td>
                    {r.goodsOwner.type === "individual" ? (
                      <>
                        <div>{r.goodsOwner.fullName}</div>
                        <div className="text-xs text-slate-400">{r.goodsOwner.phone}</div>
                      </>
                    ) : (
                      <>
                        <div>{r.goodsOwner.companyName}</div>
                        <div className="text-xs text-slate-400">
                          ИНН {r.goodsOwner.inn} · дир. {r.goodsOwner.directorName}
                        </div>
                      </>
                    )}
                    <span
                      className={`badge mt-1 ${
                        r.goodsOwner.type === "individual"
                          ? "bg-brand-50 text-brand-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {r.goodsOwner.type === "individual" ? "физ. лицо" : "юр. лицо"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">{formatTariffText(r.tariff)}</td>
                  <td>
                    {typeof r.createdByEmployeeId === "object"
                      ? r.createdByEmployeeId?.name
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.goodsOwner.type === "individual" && (
                      <a
                        className="btn-secondary mr-2"
                        href={`/api/records/${r._id}/contract`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Договор
                      </a>
                    )}
                    <button
                      className="btn-secondary mr-2"
                      onClick={() => {
                        setEditError(null);
                        setEditing(r);
                      }}
                    >
                      Изменить
                    </button>
                    <button className="btn-secondary mr-2" onClick={() => openHistory(r)}>
                      История
                    </button>
                    <button className="btn-danger" onClick={() => handleDelete(r._id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="card w-full max-w-lg my-8">
            <h3 className="text-lg font-medium text-slate-700 mb-3">Редактирование записи</h3>
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
                <p className="text-sm font-medium text-slate-600">Владелец груза</p>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    className={`rounded px-2 py-1 border ${
                      editing.goodsOwner.type === "individual"
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-500"
                    }`}
                    onClick={() => setEditing({ ...editing, goodsOwner: { ...blankIndividual } })}
                  >
                    Физ. лицо
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-1 border ${
                      editing.goodsOwner.type === "company"
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-slate-200 text-slate-500"
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

              <p className="text-sm font-medium text-slate-600 pt-2">Тариф</p>
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

              {editError && <p className="text-sm text-red-600">{editError}</p>}
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
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="card w-full max-w-lg my-8">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-medium text-slate-700">
                История изменений — {historyFor.productName}
              </h3>
              <button className="btn-secondary" onClick={() => setHistoryFor(null)}>
                Закрыть
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Изменений не зафиксировано.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {history.map((h) => (
                  <div key={h._id} className="border border-slate-200 rounded-lg p-3 text-xs">
                    <div className="flex justify-between text-slate-500 mb-1">
                      <span>
                        {h.action === "create" ? "Создание" : h.action === "update" ? "Изменение" : "Удаление"}
                        {" · "}
                        {h.actorId} ({h.actorRole})
                      </span>
                      <span>{new Date(h.timestamp).toLocaleString("ru-RU")}</span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-slate-600">
                      {JSON.stringify(h.changes, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
