"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Phone, Send, Check, X, ShieldOff, Boxes, KeyRound } from "lucide-react";

interface Employee {
  _id: string;
  name: string;
  phone: string;
  telegramId: string;
  telegramUsername?: string;
  status: "pending" | "approved" | "rejected";
  containerAccess: string[];
  createdAt: string;
}

interface ContainerOption {
  _id: string;
  name: string;
}

const statusLabels: Record<string, string> = {
  pending: "Ожидает подтверждения",
  approved: "Подтверждён",
  rejected: "Отклонён",
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

const statusDot: Record<string, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

function TableSkeleton() {
  return (
    <div className="space-y-2.5 p-1">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="skeleton h-11 w-full" />
      ))}
    </div>
  );
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [managing, setManaging] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/employees");
    const data = await res.json();
    setEmployees(data.employees || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
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

  async function saveContainerAccess(id: string, containerAccess: string[]) {
    setBusyId(id);
    try {
      await fetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerAccess }),
      });
      setManaging(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = employees.filter((e) => e.status === "pending");
  const others = employees.filter((e) => e.status !== "pending");

  const PersonCell = ({ e }: { e: Employee }) => (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
        {initials(e.name)}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-ink-800 truncate">{e.name}</div>
        <div className="text-xs text-ink-400 flex items-center gap-1">
          <Phone className="h-3 w-3" strokeWidth={2} /> {e.phone}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Персонал</p>
        <h1 className="section-title mt-1">Сотрудники</h1>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-ink-800">Заявки на регистрацию</h2>
        {pending.length > 0 && <span className="badge bg-amber-100 text-amber-700">{pending.length}</span>}
      </div>
      <div className="card mb-8 overflow-x-auto">
        {loading ? (
          <TableSkeleton />
        ) : pending.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Send className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Новых заявок нет.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Telegram</th>
                <th>Дата заявки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((e) => (
                <tr key={e._id}>
                  <td>
                    <PersonCell e={e} />
                  </td>
                  <td className="text-ink-500">{e.telegramUsername ? `@${e.telegramUsername}` : e.telegramId}</td>
                  <td className="whitespace-nowrap text-ink-500">
                    {new Date(e.createdAt).toLocaleString("ru-RU")}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex gap-2 justify-end">
                      <button
                        className="btn-primary btn-sm"
                        disabled={busyId === e._id}
                        onClick={() => setStatus(e._id, "approved")}
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Одобрить
                      </button>
                      <button
                        className="btn-danger-ghost btn-sm"
                        disabled={busyId === e._id}
                        onClick={() => setStatus(e._id, "rejected")}
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Отклонить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="text-base font-semibold text-ink-800 mb-3">Все сотрудники</h2>
      <div className="card overflow-x-auto">
        {loading ? (
          <TableSkeleton />
        ) : others.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Users className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Пока нет обработанных сотрудников.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Сотрудник</th>
                <th>Telegram</th>
                <th>Статус</th>
                <th>Контейнеры</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {others.map((e) => (
                <tr key={e._id}>
                  <td>
                    <PersonCell e={e} />
                  </td>
                  <td className="text-ink-500">{e.telegramUsername ? `@${e.telegramUsername}` : e.telegramId}</td>
                  <td>
                    <span className={`badge ${statusColors[e.status]}`}>
                      <span className={`badge-dot ${statusDot[e.status]}`} />
                      {statusLabels[e.status]}
                    </span>
                  </td>
                  <td className="text-ink-500">
                    {e.containerAccess.length === 0 ? "Все контейнеры" : `Выбрано: ${e.containerAccess.length}`}
                  </td>
                  <td className="whitespace-nowrap">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => setManaging(e)}>
                        <KeyRound className="h-3.5 w-3.5" strokeWidth={2.1} />
                        Доступ
                      </button>
                      {e.status === "approved" ? (
                        <button
                          className="btn-danger-ghost btn-sm"
                          disabled={busyId === e._id}
                          onClick={() => setStatus(e._id, "rejected")}
                        >
                          <ShieldOff className="h-3.5 w-3.5" strokeWidth={2.1} />
                          Отозвать доступ
                        </button>
                      ) : (
                        <button
                          className="btn-primary btn-sm"
                          disabled={busyId === e._id}
                          onClick={() => setStatus(e._id, "approved")}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                          Одобрить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {managing && (
        <ContainerAccessModal
          employee={managing}
          containers={containers}
          busy={busyId === managing._id}
          onClose={() => setManaging(null)}
          onSave={(ids) => saveContainerAccess(managing._id, ids)}
        />
      )}
    </div>
  );
}

/**
 * Пустой выбор = доступ ко всем контейнерам (см. models/Employee.ts). Переключатель "Все
 * контейнеры" сбрасывает выбор в пустой массив вместо того, чтобы отмечать все чекбоксы —
 * так набор контейнеров может расти без необходимости заново открывать доступ.
 */
function ContainerAccessModal({
  employee,
  containers,
  busy,
  onClose,
  onSave,
}: {
  employee: Employee;
  containers: ContainerOption[];
  busy: boolean;
  onClose: () => void;
  onSave: (containerIds: string[]) => void;
}) {
  const [unrestricted, setUnrestricted] = useState(employee.containerAccess.length === 0);
  const [selected, setSelected] = useState<Set<string>>(new Set(employee.containerAccess));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="card-title flex items-center gap-2">
            <Boxes className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
            Доступ к контейнерам — {employee.name}
          </h3>
          <button className="btn-icon btn-ghost" onClick={onClose} aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <label className="flex items-center gap-2 mb-3 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={unrestricted}
            onChange={(e) => setUnrestricted(e.target.checked)}
          />
          Доступ ко всем контейнерам
        </label>

        {!unrestricted && (
          <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4 border border-ink-100 rounded-xl p-2.5">
            {containers.length === 0 ? (
              <p className="text-sm text-ink-400 px-1 py-2">Контейнеров пока нет.</p>
            ) : (
              containers.map((c) => (
                <label key={c._id} className="flex items-center gap-2 text-sm text-ink-700 px-1 py-1">
                  <input type="checkbox" checked={selected.has(c._id)} onChange={() => toggle(c._id)} />
                  {c.name}
                </label>
              ))
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => onSave(unrestricted ? [] : Array.from(selected))}
          >
            Сохранить
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
