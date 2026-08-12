"use client";

import { useEffect, useState, useCallback } from "react";
import { Truck, Plus, Trash2, PackageCheck, PackageX } from "lucide-react";

interface TransportContainerRow {
  _id: string;
  label: string;
  status: "in_use" | "free";
  currentOwnerLabel?: string;
  givenAt?: string;
  freedAt?: string;
}

/**
 * Контейнеры для перевозки — временные, без камер/актов (см. models/TransportContainer.ts).
 * Выдаются клиентам для перевозки груза; когда клиент привёз груз и освободил контейнер,
 * сотрудник (или владелец здесь) просто отмечает его свободным.
 */
export default function TransportContainersPage() {
  const [containers, setContainers] = useState<TransportContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [giving, setGiving] = useState<TransportContainerRow | null>(null);
  const [ownerLabel, setOwnerLabel] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/transport-containers");
    const data = await res.json().catch(() => ({}));
    setContainers(data.containers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    if (!label.trim()) return;
    setBusyId("new");
    setError(null);
    try {
      const res = await fetch("/api/transport-containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setLabel("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function free(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/transport-containers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "free" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function give() {
    if (!giving || !ownerLabel.trim()) return;
    setBusyId(giving._id);
    try {
      const res = await fetch(`/api/transport-containers/${giving._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "give", currentOwnerLabel: ownerLabel.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setGiving(null);
      setOwnerLabel("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Удалить контейнер для перевозки?")) return;
    setBusyId(id);
    try {
      await fetch(`/api/transport-containers/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Контейнеры для перевозки</h1>
        <p className="text-sm text-ink-400 mt-1">
          Временные контейнеры, которые выдаются клиентам для перевозки груза — без камер, обходов и актов.
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Номер/название контейнера"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn-primary shrink-0" disabled={busyId === "new"} onClick={create}>
            <Plus className="h-4 w-4" strokeWidth={2.1} />
            Добавить
          </button>
        </div>
        {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : containers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Truck className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Контейнеров для перевозки пока нет.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Статус</th>
                <th>Клиент</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c._id}>
                  <td className="font-medium text-ink-800">{c.label}</td>
                  <td>
                    <span
                      className={`badge ${c.status === "in_use" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                    >
                      {c.status === "in_use" ? "Занят" : "Свободен"}
                    </span>
                  </td>
                  <td className="text-ink-500">{c.currentOwnerLabel || "—"}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      {c.status === "free" ? (
                        <button
                          className="btn-icon btn-secondary"
                          title="Выдать клиенту"
                          disabled={busyId === c._id}
                          onClick={() => {
                            setGiving(c);
                            setOwnerLabel("");
                          }}
                        >
                          <PackageCheck className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      ) : (
                        <button
                          className="btn-icon btn-secondary"
                          title="Освободить"
                          disabled={busyId === c._id}
                          onClick={() => free(c._id)}
                        >
                          <PackageX className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      )}
                      <button
                        className="btn-icon btn-danger-ghost"
                        title="Удалить"
                        disabled={busyId === c._id}
                        onClick={() => remove(c._id)}
                      >
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

      {giving && (
        <div className="modal-backdrop" onClick={() => setGiving(null)}>
          <div className="modal-panel max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title mb-4">Выдать «{giving.label}» клиенту</h3>
            <input
              className="input mb-3"
              placeholder="ФИО/наименование клиента"
              value={ownerLabel}
              onChange={(e) => setOwnerLabel(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busyId === giving._id} onClick={give}>
                Выдать
              </button>
              <button className="btn-secondary" onClick={() => setGiving(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
