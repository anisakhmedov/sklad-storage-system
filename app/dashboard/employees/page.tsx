"use client";

import { useEffect, useState, useCallback } from "react";

interface Employee {
  _id: string;
  name: string;
  phone: string;
  telegramId: string;
  telegramUsername?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

const statusLabels: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  rejected: "Отклонён",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/employees");
    const data = await res.json();
    setEmployees(data.employees || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    try {
      await fetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = employees.filter((e) => e.status === "pending");
  const others = employees.filter((e) => e.status !== "pending");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Сотрудники</h1>

      <h2 className="text-lg font-medium text-slate-700 mb-3">
        Заявки на регистрацию {pending.length > 0 && `(${pending.length})`}
      </h2>
      <div className="card mb-8 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-slate-500">Новых заявок нет.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Telegram</th>
                <th>Дата заявки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((e) => (
                <tr key={e._id}>
                  <td>{e.name}</td>
                  <td>{e.phone}</td>
                  <td>{e.telegramUsername ? `@${e.telegramUsername}` : e.telegramId}</td>
                  <td>{new Date(e.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="whitespace-nowrap">
                    <button
                      className="btn-primary mr-2"
                      disabled={busyId === e._id}
                      onClick={() => setStatus(e._id, "approved")}
                    >
                      Одобрить
                    </button>
                    <button
                      className="btn-danger"
                      disabled={busyId === e._id}
                      onClick={() => setStatus(e._id, "rejected")}
                    >
                      Отклонить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="text-lg font-medium text-slate-700 mb-3">Все сотрудники</h2>
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : others.length === 0 ? (
          <p className="text-sm text-slate-500">Пока нет обработанных сотрудников.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Telegram</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {others.map((e) => (
                <tr key={e._id}>
                  <td>{e.name}</td>
                  <td>{e.phone}</td>
                  <td>{e.telegramUsername ? `@${e.telegramUsername}` : e.telegramId}</td>
                  <td>
                    <span className={`badge ${statusColors[e.status]}`}>
                      {statusLabels[e.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    {e.status === "approved" ? (
                      <button
                        className="btn-danger"
                        disabled={busyId === e._id}
                        onClick={() => setStatus(e._id, "rejected")}
                      >
                        Отозвать доступ
                      </button>
                    ) : (
                      <button
                        className="btn-primary"
                        disabled={busyId === e._id}
                        onClick={() => setStatus(e._id, "approved")}
                      >
                        Одобрить
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
