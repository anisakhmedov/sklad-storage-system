"use client";

import { useEffect, useState, useCallback } from "react";
import { Boxes, PackagePlus, Pencil, Trash2, AlertCircle, X } from "lucide-react";
import ContainerCellsGrid from "@/components/dashboard/ContainerCellsGrid";

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
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Контейнеры</h1>
      </div>

      <div className="card mb-8 max-w-lg">
        <div className="card-header">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
              Новый контейнер
            </h2>
          </div>
        </div>
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
          {error && !editing && (
            <div className="alert-danger">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
          <button className="btn-primary" disabled={busy}>
            <PackagePlus className="h-4 w-4" strokeWidth={2.1} />
            Добавить
          </button>
        </form>
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
              <Boxes className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Контейнеров пока нет.</p>
          </div>
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
                  <td>
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <Boxes className="h-4 w-4" strokeWidth={2} />
                      </div>
                      <span className="font-medium text-ink-800">{c.name}</span>
                    </div>
                  </td>
                  <td className="max-w-xs truncate text-ink-500">{c.description || "—"}</td>
                  <td className="text-ink-500">{c.createdBy}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        Изменить
                      </button>
                      <button className="btn-danger-ghost btn-sm" onClick={() => handleDelete(c._id)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8">
        <p className="section-eyebrow">Занятость</p>
        <h2 className="section-title mt-1 text-lg">Камеры хранения</h2>
        <ContainerCellsGrid />
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="card-title">Редактирование контейнера</h3>
              <button className="btn-icon btn-ghost" onClick={() => setEditing(null)} aria-label="Закрыть">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
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
              {error && (
                <div className="alert-danger">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
                  <span>{error}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
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
