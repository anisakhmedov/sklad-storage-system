"use client";

import { useEffect, useState, useCallback } from "react";

interface AccessRow {
  _id: string;
  identifier: string;
  role: "owner" | "trusted";
  status: "active" | "revoked";
  grantedBy: string;
  createdAt: string;
}

export default function AccessPage() {
  const [list, setList] = useState<AccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<"owner" | "trusted">("trusted");
  const [error, setError] = useState<string | null>(null);
  const [tempInfo, setTempInfo] = useState<{ identifier: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/access");
    const data = await res.json();
    setList(data.access || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTempInfo(null);
    setBusy(true);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setTempInfo({ identifier: data.access.identifier, password: data.tempPassword });
      setIdentifier("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(row: AccessRow) {
    const nextStatus = row.status === "active" ? "revoked" : "active";
    await fetch(`/api/access/${row._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Доступ к веб-панели</h1>

      <div className="card mb-8 max-w-lg">
        <h2 className="text-lg font-medium text-slate-700 mb-3">Выдать доступ</h2>
        <form onSubmit={handleGrant} className="space-y-3">
          <div>
            <label className="label">Username (без @) или телефон</label>
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="ivanov или +998901234567"
            />
          </div>
          <div>
            <label className="label">Роль</label>
            <select
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as "owner" | "trusted")}
            >
              <option value="trusted">Доверенное лицо (полный доступ)</option>
              <option value="owner">Владелец</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            Выдать доступ
          </button>
        </form>

        {tempInfo && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
            Доступ выдан для <b>{tempInfo.identifier}</b>. Временный пароль:{" "}
            <code className="bg-white px-1.5 py-0.5 rounded border">{tempInfo.password}</code>
            <br />
            Передайте его пользователю — он будет предложен сменить пароль при первом входе.
          </div>
        )}
      </div>

      <h2 className="text-lg font-medium text-slate-700 mb-3">Список доступов</h2>
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Идентификатор</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Выдал</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((row) => (
                <tr key={row._id}>
                  <td>{row.identifier}</td>
                  <td>{row.role === "owner" ? "Владелец" : "Доверенное лицо"}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {row.status === "active" ? "Активен" : "Отозван"}
                    </span>
                  </td>
                  <td>{row.grantedBy}</td>
                  <td>{new Date(row.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td>
                    <button className="btn-secondary" onClick={() => toggleStatus(row)}>
                      {row.status === "active" ? "Отозвать" : "Восстановить"}
                    </button>
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
