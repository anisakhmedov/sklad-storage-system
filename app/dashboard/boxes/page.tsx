"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackageSearch, UserRound, Building2, FileStack } from "lucide-react";
import ActsModal from "@/components/dashboard/ActsModal";

interface BoxBalanceRow {
  ownerKey: string;
  ownerType: "individual" | "company";
  ownerLabel: string;
  containerId: string;
  containerName: string;
  outstanding: number;
  ratePerBox: number;
  owedAmount: number;
  lastActivity: string;
}

const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default function BoxesPage() {
  const [rows, setRows] = useState<BoxBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actsFor, setActsFor] = useState<BoxBalanceRow | null>(null);

  useEffect(() => {
    fetch("/api/boxes")
      .then((r) => r.json())
      .then((d) => setRows(d.balances || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-7">
        <p className="section-eyebrow">Склад</p>
        <h1 className="section-title mt-1">Ящики</h1>
        <p className="text-sm text-ink-400 mt-1">
          Ящики, выданные клиентам под товар и подлежащие возврату — количество и сумма.
        </p>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="space-y-2.5 p-1">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-11 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <PackageSearch className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <p className="text-sm text-ink-500">Все ящики возвращены — задолженностей нет.</p>
          </div>
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                <th>Арендатор</th>
                <th>Контейнер</th>
                <th>Должно ящиков</th>
                <th>Ставка/ящ.</th>
                <th>Сумма</th>
                <th>Последняя операция</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const Icon = r.ownerType === "individual" ? UserRound : Building2;
                return (
                  <tr key={`${r.ownerKey}::${r.containerId}`}>
                    <td>
                      <Link
                        href={`/dashboard/tenants/${encodeURIComponent(r.ownerKey)}`}
                        className="flex items-center gap-2 hover:text-brand-600"
                      >
                        <Icon className="h-4 w-4 text-ink-400" strokeWidth={2} />
                        <span className="font-medium text-ink-800">{r.ownerLabel}</span>
                      </Link>
                    </td>
                    <td className="text-ink-500">{r.containerName}</td>
                    <td className="tabular-nums font-medium text-rose-600">{r.outstanding}</td>
                    <td className="tabular-nums text-ink-500">{money(r.ratePerBox)}</td>
                    <td className="tabular-nums font-medium text-ink-800">{money(r.owedAmount)}</td>
                    <td className="whitespace-nowrap text-ink-500">
                      {new Date(r.lastActivity).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="whitespace-nowrap">
                      <button className="btn-icon btn-secondary" title="Акты" onClick={() => setActsFor(r)}>
                        <FileStack className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {actsFor && (
        <ActsModal ownerKey={actsFor.ownerKey} containerId={actsFor.containerId} onClose={() => setActsFor(null)} />
      )}
    </div>
  );
}
