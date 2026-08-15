"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Landmark, Plus, Pencil, Trash2, X, Boxes, Check } from "lucide-react";

interface FirmRow {
  _id: string;
  name: string;
  directorFullName: string;
  directorShortName: string;
  address: string;
  bankBranch: string;
  bankAccount: string;
  inn: string;
  bankCode: string;
}

interface ContainerRow {
  _id: string;
  name: string;
  firmId?: string | null;
}

const emptyForm = {
  name: "",
  directorFullName: "",
  directorShortName: "",
  address: "",
  bankBranch: "",
  bankAccount: "",
  inn: "",
  bankCode: "",
};

/**
 * Свои фирмы владельца склада — от чьего имени составляется договор/акт ("Сақловчи").
 * Сотрудник выбирает нужную при создании записи в Mini App (см. components/miniapp/
 * NewRecordWizard.tsx). Пока не заведена ни одна фирма, документы используют
 * lib/contract/firmDefaults.ts::DEFAULT_FIRM (прежние захардкоженные реквизиты).
 */
export default function FirmsPage() {
  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FirmRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Какой фирме сейчас редактируется список привязанных контейнеров (см. ContainerAssignModal
  // ниже) — модалка "Контейнеры" открыта, когда не null.
  const [assigningFirm, setAssigningFirm] = useState<FirmRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/firms");
    const data = await res.json().catch(() => ({}));
    setFirms(data.firms || []);
    setLoading(false);
  }, []);

  const loadContainers = useCallback(async () => {
    const res = await fetch("/api/containers");
    const data = await res.json().catch(() => ({}));
    setContainers((data.containers || []).map((c: any) => ({ _id: c._id, name: c.name, firmId: c.firmId ? String(c.firmId) : null })));
  }, []);

  useEffect(() => {
    load();
    loadContainers();
  }, [load, loadContainers]);

  // containerId -> название фирмы, к которой он сейчас привязан — для подписи "N контейнеров"
  // в таблице и для подсказки "уже привязан к «X»" в модалке назначения (см. ниже).
  const firmNameById = useMemo(() => new Map(firms.map((f) => [f._id, f.name])), [firms]);
  const containersByFirm = useMemo(() => {
    const map = new Map<string, ContainerRow[]>();
    for (const c of containers) {
      if (!c.firmId) continue;
      if (!map.has(c.firmId)) map.set(c.firmId, []);
      map.get(c.firmId)!.push(c);
    }
    return map;
  }, [containers]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEdit(f: FirmRow) {
    setEditing(f);
    setForm({
      name: f.name,
      directorFullName: f.directorFullName,
      directorShortName: f.directorShortName,
      address: f.address,
      bankBranch: f.bankBranch,
      bankAccount: f.bankAccount,
      inn: f.inn,
      bankCode: f.bankCode,
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/firms/${editing._id}` : "/api/firms", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setShowModal(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить фирму? Уже выданные документы не изменятся.")) return;
    await fetch(`/api/firms/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <div className="mb-7 flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="section-eyebrow">Склад</p>
          <h1 className="section-title mt-1">Фирмы</h1>
          <p className="text-sm text-ink-400 mt-1 max-w-2xl leading-relaxed">
            Свои фирмы, от чьего имени составляются договоры и акты (&quot;Сақловчи&quot;). Привяжите
            контейнеры к фирме (кнопка «Контейнеры» в строке) — тогда для записей в этом
            контейнере фирма подставляется автоматически, и сотруднику не нужно выбирать её в
            Mini App. Пока фирм нет, используются прежние реквизиты по умолчанию.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" strokeWidth={2.1} />
          Добавить фирму
        </button>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : firms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Landmark className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">
              Фирм пока нет — используются реквизиты по умолчанию (&quot;INTURIST MAROQAND&quot; МЧЖ).
            </p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Название</th>
                <th>Директор</th>
                <th>ИНН</th>
                <th>Расчётный счёт</th>
                <th>Контейнеры</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {firms.map((f) => {
                const boundContainers = containersByFirm.get(f._id) || [];
                return (
                <tr key={f._id}>
                  <td className="font-medium text-ink-800">{f.name}</td>
                  <td className="text-ink-500">{f.directorFullName}</td>
                  <td className="text-ink-500">{f.inn}</td>
                  <td className="text-ink-500">{f.bankAccount}</td>
                  <td>
                    {boundContainers.length === 0 ? (
                      <span className="text-ink-300">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {boundContainers.map((c) => (
                          <span key={c._id} className="badge bg-brand-50 text-brand-700">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      <button
                        className="btn-icon btn-secondary"
                        title="Контейнеры — привязать/отвязать"
                        onClick={() => setAssigningFirm(f)}
                      >
                        <Boxes className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button className="btn-icon btn-secondary" title="Изменить" onClick={() => openEdit(f)}>
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button className="btn-icon btn-danger-ghost" title="Удалить" onClick={() => handleDelete(f._id)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop overflow-y-auto py-8" onClick={() => setShowModal(false)}>
          <div className="modal-panel w-full max-w-lg my-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="card-title">{editing ? "Изменить фирму" : "Новая фирма"}</h3>
              <button className="btn-icon btn-ghost" onClick={() => setShowModal(false)} aria-label="Закрыть">
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Название фирмы (как в договоре, с орг.-правовой формой)</label>
                <input
                  className="input"
                  placeholder='напр. INTURIST MAROQAND МЧЖ'
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ФИО директора (полностью, для текста договора)</label>
                  <input
                    className="input"
                    placeholder="напр. RAXIMOV OLIMJON ALIYEVICH"
                    value={form.directorFullName}
                    onChange={(e) => setForm({ ...form, directorFullName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Директор — сокращённо (для подписи)</label>
                  <input
                    className="input"
                    placeholder="напр. О.Рахимов"
                    value={form.directorShortName}
                    onChange={(e) => setForm({ ...form, directorShortName: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">Адрес</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Банк / отделение</label>
                <input
                  className="input"
                  value={form.bankBranch}
                  onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Расчётный счёт</label>
                  <input
                    className="input"
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">ИНН</label>
                  <input
                    className="input"
                    value={form.inn}
                    onChange={(e) => setForm({ ...form, inn: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="label">Банк. код (МФО)</label>
                  <input
                    className="input"
                    value={form.bankCode}
                    onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
                    required
                  />
                </div>
              </div>

              {error && <div className="alert-danger">{error}</div>}
              <div className="flex gap-2 pt-1">
                <button className="btn-primary" disabled={busy}>
                  {busy ? "Сохранение…" : "Сохранить"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assigningFirm && (
        <ContainerAssignModal
          firm={assigningFirm}
          containers={containers}
          firmNameById={firmNameById}
          onClose={() => setAssigningFirm(null)}
          onChanged={loadContainers}
        />
      )}
    </div>
  );
}

/**
 * Привязка контейнеров к фирме (см. models/Container.ts::firmId) — какие контейнеры используют
 * эту фирму по умолчанию при создании записи в Mini App (шаг "firm" пропускается, см.
 * components/miniapp/NewRecordWizard.tsx). Каждый контейнер может быть привязан только к одной
 * фирме — отметка контейнера, уже привязанного к другой фирме, переносит его сюда (отвязывает
 * от прежней).
 */
function ContainerAssignModal({
  firm,
  containers,
  firmNameById,
  onClose,
  onChanged,
}: {
  firm: FirmRow;
  containers: ContainerRow[];
  firmNameById: Map<string, string>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  // Локальный "в процессе" на конкретный контейнер — чтобы не блокировать всю модалку разом,
  // пока переключается один чекбокс.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(container: ContainerRow) {
    const isBoundHere = container.firmId === firm._id;
    setPendingId(container._id);
    setError(null);
    try {
      const res = await fetch(`/api/containers/${container._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firmId: isBoundHere ? null : firm._id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось сохранить");
        return;
      }
      await onChanged();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="modal-backdrop overflow-y-auto py-8" onClick={onClose}>
      <div className="modal-panel w-full max-w-md my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="card-title">Контейнеры фирмы «{firm.name}»</h3>
            <p className="card-subtitle">Отмеченные контейнеры используют эту фирму автоматически, без шага выбора в Mini App.</p>
          </div>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {containers.length === 0 ? (
          <div className="empty-state py-6">
            <p className="text-sm text-ink-500">Контейнеров ещё нет.</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto -mr-1 pr-1">
            {containers.map((c) => {
              const isBoundHere = c.firmId === firm._id;
              const boundElsewhereName = c.firmId && !isBoundHere ? firmNameById.get(c.firmId) : null;
              const busy = pendingId === c._id;
              return (
                <button
                  key={c._id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(c)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    isBoundHere ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
                  } disabled:opacity-60`}
                >
                  <div>
                    <div className="text-sm font-medium text-ink-800">{c.name}</div>
                    {boundElsewhereName && (
                      <div className="text-xs text-amber-600 mt-0.5">
                        сейчас привязан к «{boundElsewhereName}» — отметка перенесёт сюда
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      isBoundHere ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300"
                    }`}
                  >
                    {isBoundHere && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {error && <div className="alert-danger mt-3">{error}</div>}
        <div className="flex gap-2 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
