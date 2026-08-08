"use client";

import { useEffect, useState, useCallback } from "react";

interface ContainerRow {
  _id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<ContainerRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/containers");
    const data = await res.json();
    setContainers(data.containers || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setName("");
      setDescription("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/containers/${editing._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, description: editing.description }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить контейнер?")) return;
    const res = await fetch(`/api/containers/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Ошибка удаления");
      return;
    }
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Контейнеры</h1>

      <div className="card mb-8 max-w-lg">
        <h2 className="text-lg font-medium text-slate-700 mb-3">Новый контейнер</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="label">Номер / название</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Описание</label>
            <textarea
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          {error && !editing && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary" disabled={busy}>
            Добавить
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : containers.length === 0 ? (
          <p className="text-sm text-slate-500">Контейнеров пока нет.</p>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Название</th>
                <th>Описание</th>
                <th>Создал</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => (
                <tr key={c._id}>
                  <td>{c.name}</td>
                  <td className="max-w-xs truncate">{c.description}</td>
                  <td>{c.createdBy}</td>
                  <td className="whitespace-nowrap">
                    <button className="btn-secondary mr-2" onClick={() => setEditing(c)}>
                      Изменить
                    </button>
                    <button className="btn-danger" onClick={() => handleDelete(c._id)}>
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
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="card w-full max-w-md">
            <h3 className="text-lg font-medium text-slate-700 mb-3">Редактирование контейнера</h3>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="label">Номер / название</label>
                <input
                  className="input"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Описание</label>
                <textarea
                  className="input"
                  rows={2}
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy}>
                  Сохранить
                </button>
                <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
