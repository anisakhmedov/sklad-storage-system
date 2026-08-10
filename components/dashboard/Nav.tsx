"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Обзор" },
  { href: "/dashboard/employees", label: "Сотрудники" },
  { href: "/dashboard/access", label: "Доступ" },
  { href: "/dashboard/containers", label: "Контейнеры" },
  { href: "/dashboard/records", label: "Записи" },
  { href: "/dashboard/income", label: "Оплаты" },
  { href: "/dashboard/reports", label: "Отчётность" },
];

export default function Nav({ identifier, role }: { identifier: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="font-semibold text-slate-800">Sklad</div>
        <div className="text-xs text-slate-500 mt-1">
          {identifier} · {role === "owner" ? "Владелец" : "Доверенное лицо"}
        </div>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map((l) => {
          const active = l.href === "/dashboard" ? pathname === l.href : pathname?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-100">
        <button onClick={handleLogout} className="btn-secondary w-full">
          Выйти
        </button>
      </div>
    </div>
  );
}
