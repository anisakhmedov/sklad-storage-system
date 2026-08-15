"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  LayoutGrid,
  Users,
  KeyRound,
  Boxes,
  ClipboardList,
  Wallet,
  BarChart3,
  LogOut,
  Menu,
  X,
  UserRound,
  History,
  Thermometer,
  Package,
  PackageMinus,
  Landmark,
} from "lucide-react";

const links = [
  { href: "/dashboard", label: "Обзор", icon: LayoutGrid },
  { href: "/dashboard/employees", label: "Сотрудники", icon: Users },
  { href: "/dashboard/access", label: "Доступ", icon: KeyRound },
  { href: "/dashboard/firms", label: "Фирмы", icon: Landmark },
  { href: "/dashboard/containers", label: "Контейнеры", icon: Boxes },
  { href: "/dashboard/records", label: "Записи", icon: ClipboardList },
  { href: "/dashboard/inventory", label: "Инвентарь", icon: Package },
  { href: "/dashboard/inventory-disposals", label: "Продажа/списание", icon: PackageMinus },
  { href: "/dashboard/income", label: "Оплаты", icon: Wallet },
  { href: "/dashboard/tenants", label: "Арендаторы", icon: UserRound },
  { href: "/dashboard/patrols", label: "Обходы", icon: Thermometer },
  { href: "/dashboard/reports", label: "Отчётность", icon: BarChart3 },
  { href: "/dashboard/audit", label: "Активность", icon: History },
];

export default function Nav({ identifier, role }: { identifier: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initial = identifier?.trim()?.[0]?.toUpperCase() || "?";
  const roleLabel = role === "owner" ? "Владелец" : "Доверенное лицо";

  const NavLinks = () => (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {links.map((l) => {
        const active = l.href === "/dashboard" ? pathname === l.href : pathname?.startsWith(l.href);
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={active ? "nav-link-active" : "nav-link-inactive"}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.1} />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="px-4 py-5 flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm shadow-brand-600/25">
        <Boxes className="h-4.5 w-4.5" strokeWidth={2.25} />
      </div>
      <div>
        <div className="font-semibold text-ink-900 leading-none tracking-tight">Sklad</div>
        <div className="text-[11px] text-ink-400 mt-1">Учёт хранения</div>
      </div>
    </div>
  );

  const UserCard = () => (
    <div className="px-3 pb-3">
      <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-800 truncate">{identifier}</div>
          <div className="text-[11px] text-ink-400">{roleLabel}</div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile topbar */}
      <div className="lg:hidden sticky top-0 z-40 flex items-center justify-between border-b border-ink-100 bg-white/90 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient text-white">
            <Boxes className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <span className="font-semibold text-ink-900 tracking-tight">Sklad</span>
        </div>
        <button
          className="btn-icon btn-secondary"
          aria-label="Открыть меню"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-popover flex flex-col animate-slide-in-left">
            <div className="flex items-center justify-between border-b border-ink-100">
              <Brand />
              <button
                className="btn-icon btn-ghost mr-3"
                aria-label="Закрыть меню"
                onClick={() => setOpen(false)}
              >
                <X className="h-4.5 w-4.5" strokeWidth={2.1} />
              </button>
            </div>
            <UserCard />
            <NavLinks />
            <div className="px-3 py-4 border-t border-ink-100">
              <button onClick={handleLogout} className="btn-secondary w-full">
                <LogOut className="h-4 w-4" strokeWidth={2.1} />
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 shrink-0 border-r border-ink-100 bg-white flex-col min-h-screen sticky top-0 h-screen">
        <div className="border-b border-ink-100">
          <Brand />
        </div>
        <div className="pt-3">
          <UserCard />
        </div>
        <NavLinks />
        <div className="px-3 py-4 border-t border-ink-100">
          <button onClick={handleLogout} className="btn-secondary w-full">
            <LogOut className="h-4 w-4" strokeWidth={2.1} />
            Выйти
          </button>
        </div>
      </div>
    </>
  );
}
