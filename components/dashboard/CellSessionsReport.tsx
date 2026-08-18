"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, CircleDot, Users, PackageSearch } from "lucide-react";

interface Participant {
  clientId: string;
  ownerLabel: string;
  ownerType: "individual" | "company";
  arrivedAt: string;
  leftAt?: string;
  productSummary: string;
}

interface Session {
  containerId: string;
  containerName: string;
  cellNumber: number;
  startedAt: string;
  endedAt?: string;
  isOpen: boolean;
  durationDays: number;
  participants: Participant[];
}

interface ContainerSections {
  containerId: string;
  containerName: string;
  cells: { cellNumber: number; sessions: Session[] }[];
}

const fmt = (d: string) => new Date(d).toLocaleDateString("ru-RU");

/**
 * Отчёт «Заполненность камер» (см. lib/cellSessions.ts) — история отсчётов по каждой камере:
 * с момента, когда в пустую камеру заехал первый арендатор, до момента, когда камера снова
 * полностью опустела. Пока в камере остаётся хотя бы один арендатор, отсчёт не прерывается —
 * даже если за это время в неё заезжают и выезжают другие.
 */
export default function CellSessionsReport({
  containerId,
  onlyClosed = false,
}: {
  containerId: string;
  /** true — показывать только ЗАКРЫТЫЕ сессии (камера уже полностью опустела), скрывая текущие
   * открытые — используется страницей «Архив» (см. app/dashboard/archive/page.tsx), где нужна
   * именно история, а не то, что занято прямо сейчас (это уже видно на сетке камер). */
  onlyClosed?: boolean;
}) {
  const [sections, setSections] = useState<ContainerSections[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (containerId) params.set("containerId", containerId);
    fetch(`/api/reports/cell-sessions?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setSections(d.sections || []))
      .finally(() => setLoading(false));
  }, [containerId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card h-40 skeleton" />
        <div className="card h-40 skeleton" />
      </div>
    );
  }

  // При onlyClosed сначала отфильтровываем открытые сессии внутри каждой камеры, а уже потом
  // отбрасываем камеры/контейнеры, которые от этого опустели — иначе камера с одной открытой и
  // без единой закрытой сессии всё равно попала бы в вывод с пустым списком сессий.
  const visibleSections = sections
    .map((section) => ({
      ...section,
      cells: section.cells
        .map((cell) => ({
          ...cell,
          sessions: onlyClosed ? cell.sessions.filter((s) => !s.isOpen) : cell.sessions,
        }))
        .filter((cell) => cell.sessions.length > 0),
    }))
    .filter((section) => section.cells.length > 0);

  if (visibleSections.length === 0) {
    return (
      <div className="card empty-state">
        <div className="empty-state-icon">
          <PackageSearch className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-sm text-ink-500">
          {onlyClosed
            ? "Закрытых сессий пока нет — ни одна камера ещё не пустела после заполнения."
            : "В камерах ещё никого не было — отсчёт появится, как только заедет первый арендатор."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => (
          <div key={section.containerId} className="card">
            <div className="card-header">
              <h2 className="card-title flex items-center gap-2">
                <Boxes className="h-4 w-4 text-brand-600" strokeWidth={2.1} />
                {section.containerName}
              </h2>
            </div>
            <div className="space-y-5">
              {section.cells.map((cell) => (
                <div key={cell.cellNumber}>
                  <p className="text-sm font-semibold text-ink-700 mb-2">Камера {cell.cellNumber}</p>
                  <div className="space-y-2.5">
                    {cell.sessions.map((session, idx) => (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 ${
                          session.isOpen ? "border-brand-200 bg-brand-50/40" : "border-ink-100 bg-ink-50/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                            {fmt(session.startedAt)} — {session.endedAt ? fmt(session.endedAt) : "сейчас"}
                            <span className="text-ink-400 font-normal">· {session.durationDays} дн.</span>
                          </div>
                          {session.isOpen ? (
                            <span className="badge bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
                              <CircleDot className="h-3 w-3" strokeWidth={2.5} /> открыт
                            </span>
                          ) : (
                            <span className="badge bg-ink-100 text-ink-500">закрыт</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {session.participants.map((p) => (
                            <div
                              key={p.clientId}
                              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs"
                            >
                              <Link
                                href={`/dashboard/tenants/${encodeURIComponent(p.clientId)}`}
                                className="text-ink-700 font-medium flex items-center gap-1.5 hover:text-brand-600"
                              >
                                <Users className="h-3 w-3 text-ink-400" strokeWidth={2} />
                                {p.ownerLabel}
                                {p.productSummary && <span className="text-ink-400 font-normal">· {p.productSummary}</span>}
                              </Link>
                              <span className="text-ink-400 whitespace-nowrap">
                                {fmt(p.arrivedAt)} → {p.leftAt ? fmt(p.leftAt) : "ещё здесь"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
