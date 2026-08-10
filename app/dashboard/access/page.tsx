"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, UserPlus, ShieldCheck, ShieldOff, RotateCcw, Copy, Check, AlertCircle } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

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

  function copyPassword() {
    if (!tempInfo) return;
    navigator.clipboard?.writeText(tempInfo.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Безопасность</p>
        <h1 className="section-title mt-1">Доступ к веб-панели</h1>
      </div>

      <div className="card mb-8 max-w-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
              Выдать доступ
            </h2>
            <p className="card-subtitle">Новому пользователю будет создан временный пароль</p>
          </div>
        </div>
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
          {error && (
            <div className="alert-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          <button className="btn-primary" disabled={busy}>
            <KeyRound className="h-4 w-4" strokeWidth={2.1} />
            Выдать доступ
          </button>
        </form>

        {tempInfo && (
          <div className="alert-success mt-4 items-center animate-fade-up">
            <ShieldCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              Доступ выдан для <b>{tempInfo.identifier}</b>. Временный пароль:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-mono">
                {tempInfo.password}
              </code>
              <div className="mt-1 text-xs text-emerald-700/80">
                Передайте его пользователю — он будет предложен сменить пароль при первом входе.
              </div>
            </div>
            <button className="btn-icon btn-secondary shrink-0" onClick={copyPassword} aria-label="Скопировать пароль">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
            </button>
          </div>
        )}
      </div>

      <h2 className="text-base font-semibold text-ink-800 mb-3">Список доступов</h2>
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <KeyRound className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Доступов пока не выдано.</p>
          </div>
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
                  <td className="font-medium text-ink-800">{row.identifier}</td>
                  <td>{row.role === "owner" ? "Владелец" : "Доверенное лицо"}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-ink-100 text-ink-500"
                      }`}
                    >
                      <span className={`badge-dot ${row.status === "active" ? "bg-emerald-500" : "bg-ink-400"}`} />
                      {row.status === "active" ? "Активен" : "Отозван"}
                    </span>
                  </td>
                  <td className="text-ink-500">{row.grantedBy}</td>
                  <td className="text-ink-500 whitespace-nowrap">{new Date(row.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td>
                    <div className="flex justify-end">
                      <button
                        className={row.status === "active" ? "btn-danger-ghost btn-sm" : "btn-secondary btn-sm"}
                        onClick={() => toggleStatus(row)}
                      >
                        {row.status === "active" ? (
                          <ShieldOff className="h-3.5 w-3.5" strokeWidth={2.1} />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.1} />
                        )}
                        {row.status === "active" ? "Отозвать" : "Восстановить"}
                      </button>
                    </div>
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
