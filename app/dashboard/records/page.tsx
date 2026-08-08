"use client";

import { useEffect, useState, useCallback } from "react";

interface ContainerRef {
  _id: string;
  name: string;
}
interface EmployeeRef {
  _id: string;
  name: string;
  phone: string;
}
interface Record_ {
  _id: string;
  containerId: ContainerRef | string;
  productName: string;
  quantity: number;
  unit: string;
  goodsOwner: { fullName: string; phone: string; passportData: string; pinfl: string };
  payment: { amount: number; method: string };
  createdByEmployeeId?: EmployeeRef | string;
  createdAt: string;
  editedBy?: string;
  editedAt?: string;
}

const unitLabels: Record<string, string> = { tonne: "т", kg: "кг", box: "ящ.", piece: "шт." };
const methodLabels: Record<string, string> = { cash: "Наличные", terminal: "Терминал", transfer: "Перевод" };

export default function RecordsPage() {
  const [records, setRecords] = useState<Record_[]>([]);
  const [containers, setContainers] = useState<ContainerRef[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    containerId: "",
    product: "",
    paymentMethod: "",
    from: "",
    to: "",
  });
  const [editing, setEditing] = useState<Record_ | null>(null);
  const [historyFor, setHistoryFor] = useState<Record_ | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.containerId) params.set("containerId", filters.containerId);
    if (filters.product) params.set("product", filters.product);
    if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
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
    await fetch(`/api/records/${editing._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productName: editing.productName,
        quantity: editing.quantity,
        unit: editing.unit,
        goodsOwner: editing.goodsOwner,
        payment: editing.payment,
      }),
    });
    setEditing(null);
    await load();
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
            <label className="label">Способ оплаты</label>
            <select
              className="input"
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
            >
              <option value="">Все</option>
              <option value="cash">Наличные</option>
              <option value="terminal">Терминал</option>
              <option value="transfer">Перевод</option>
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
                <th>Оплата</th>
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
                    <div>{r.goodsOwner.fullName}</div>
                    <div className="text-xs text-slate-400">{r.goodsOwner.phone}</div>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.payment.amount.toLocaleString("ru-RU")} · {methodLabels[r.payment.method]}
                  </td>
                  <td>
                    {typeof r.createdByEmployeeId === "object"
                      ? r.createdByEmployeeId?.name
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap">
                    <button className="btn-secondary mr-2" onClick={() => setEditing(r)}>
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
                      onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                    >
                      <option value="tonne">тонны</option>
                      <option value="kg">кг</option>
                      <option value="box">ящики</option>
                      <option value="piece">штуки</option>
                    </select>
                  </div>
                </div>
              </div>

              <p className="text-sm font-medium text-slate-600 pt-2">Владелец груза</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  className="input"
                  placeholder="ФИО"
                  value={editing.goodsOwner.fullName}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      goodsOwner: { ...editing.goodsOwner, fullName: e.target.value },
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
                      goodsOwner: { ...editing.goodsOwner, phone: e.target.value },
                    })
                  }
                />
                <input
                  className="input"
                  placeholder="Паспортные данные"
                  value={editing.goodsOwner.passportData}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      goodsOwner: { ...editing.goodsOwner, passportData: e.target.value },
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
                      goodsOwner: { ...editing.goodsOwner, pinfl: e.target.value },
                    })
                  }
                />
              </div>

              <p className="text-sm font-medium text-slate-600 pt-2">Оплата</p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  className="input"
                  placeholder="Сумма"
                  value={editing.payment.amount}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      payment: { ...editing.payment, amount: Number(e.target.value) },
                    })
                  }
                />
                <select
                  className="input"
                  value={editing.payment.method}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      payment: { ...editing.payment, method: e.target.value },
                    })
                  }
                >
                  <option value="cash">Наличные</option>
                  <option value="terminal">Терминал</option>
                  <option value="transfer">Перевод</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button className="btn-primary">Сохранить</button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
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
