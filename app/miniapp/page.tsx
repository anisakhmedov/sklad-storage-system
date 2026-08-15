"use client";

import { useEffect, useState, useCallback, Children } from "react";
import { initTelegramWebApp, miniAppFetch, haptic } from "@/components/miniapp/telegram";
import { useI18n } from "@/components/miniapp/i18n";
import RegisterForm from "@/components/miniapp/RegisterForm";
import PendingScreen from "@/components/miniapp/PendingScreen";
import NewRecordWizard from "@/components/miniapp/NewRecordWizard";
import AddIncomeWizard from "@/components/miniapp/AddIncomeWizard";
import ClientsList from "@/components/miniapp/ClientsList";
import ExpensesScreen from "@/components/miniapp/ExpensesScreen";
import PatrolScreen from "@/components/miniapp/PatrolScreen";
import CellsScreen from "@/components/miniapp/CellsScreen";
import InventoryDisposalsScreen from "@/components/miniapp/InventoryDisposalsScreen";
import {
  Boxes,
  Plus,
  TriangleAlert,
  Wallet,
  ChevronRight,
  Users,
  MinusCircle,
  Thermometer,
  LayoutGrid,
  PackageMinus,
  type LucideIcon,
} from "lucide-react";

type EmployeeStatus = "pending" | "approved" | "rejected";
type Mode = "menu" | "record" | "income" | "clients" | "expenses" | "patrol" | "cells" | "disposals";

interface MeResponse {
  telegram: { id: number; firstName?: string; lastName?: string; username?: string };
  employee: { id: string; name: string; phone: string; status: EmployeeStatus } | null;
}

export default function MiniAppPage() {
  const { t } = useI18n();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("menu");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/me");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("common.error"));
        return;
      }
      setMe(data);
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initTelegramWebApp();
    load();
  }, [load]);

  // Корень навигации: сам кнопку "Назад" никогда не регистрирует (на главном меню
  // возвращаться некуда) — как только ниже открывается любой из разделов, он сам вызывает
  // useTelegramBackButton и получает кнопку; при возврате в меню его эффект чистит
  // регистрацию сам (см. telegram.ts::useTelegramBackButton). Явный вызов здесь с null
  // выполнился бы ПОСЛЕ эффекта дочернего экрана (эффекты потомков коммитятся раньше
  // родительских) и перебивал бы его показ кнопки — поэтому его нет.

  if (loading) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin" />
        <p className="text-sm text-ink-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="pt-16 text-center px-4">
        <div className="empty-state-icon bg-rose-100 text-rose-600 mx-auto">
          <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-sm text-rose-600 mt-1">{error || t("home.loadError")}</p>
      </div>
    );
  }

  if (!me.employee) {
    return <RegisterForm onRegistered={load} />;
  }

  if (me.employee.status === "pending" || me.employee.status === "rejected") {
    return <PendingScreen status={me.employee.status} />;
  }

  if (mode === "record") {
    return <NewRecordWizard onExit={() => setMode("menu")} />;
  }

  if (mode === "income") {
    return <AddIncomeWizard onExit={() => setMode("menu")} />;
  }

  if (mode === "clients") {
    return <ClientsList onExit={() => setMode("menu")} />;
  }

  if (mode === "expenses") {
    return <ExpensesScreen onExit={() => setMode("menu")} />;
  }

  if (mode === "patrol") {
    return <PatrolScreen onExit={() => setMode("menu")} />;
  }

  if (mode === "cells") {
    return <CellsScreen onExit={() => setMode("menu")} />;
  }

  if (mode === "disposals") {
    return <InventoryDisposalsScreen onExit={() => setMode("menu")} />;
  }

  function open(next: Mode) {
    haptic.selection();
    setMode(next);
  }

  return (
    <div className="pt-2">
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-sm shadow-brand-600/25">
          <Boxes className="h-6 w-6" strokeWidth={2.1} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-900 tracking-tight truncate">
            {t("home.greeting", { name: me.employee.name })}
          </h1>
          <p className="text-xs text-ink-400 mt-0.5">{t("home.subtitle")}</p>
        </div>
      </div>

      <div className="space-y-6">
        <MenuSection label={t("home.sectionDaily")} startDelay={0}>
          <MenuItem icon={Plus} tone="brand" title={t("home.newRecordTitle")} desc={t("home.newRecordDesc")} onClick={() => open("record")} />
          <MenuItem icon={Wallet} tone="emerald" title={t("home.incomeTitle")} desc={t("home.incomeDesc")} onClick={() => open("income")} />
          <MenuItem icon={Users} tone="violet" title={t("home.clientsTitle")} desc={t("home.clientsDesc")} onClick={() => open("clients")} />
        </MenuSection>

        <MenuSection label={t("home.sectionFacility")} startDelay={3}>
          <MenuItem icon={LayoutGrid} tone="teal" title={t("home.cellsTitle")} desc={t("home.cellsDesc")} onClick={() => open("cells")} />
          <MenuItem icon={Thermometer} tone="sky" title={t("home.patrolTitle")} desc={t("home.patrolDesc")} onClick={() => open("patrol")} />
          <MenuItem icon={PackageMinus} tone="indigo" title={t("home.disposalsTitle")} desc={t("home.disposalsDesc")} onClick={() => open("disposals")} />
        </MenuSection>

        <MenuSection label={t("home.sectionOther")} startDelay={6}>
          <MenuItem icon={MinusCircle} tone="rose" title={t("home.expensesTitle")} desc={t("home.expensesDesc")} onClick={() => open("expenses")} />
        </MenuSection>
      </div>
    </div>
  );
}

function MenuSection({ label, startDelay, children }: { label: string; startDelay: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="section-eyebrow mb-2 px-1">{label}</p>
      <div className="space-y-2.5">
        {Children.map(children, (child, i) => (
          <div
            className="animate-fade-up opacity-0"
            style={{ animationDelay: `${(startDelay + i) * 40}ms`, animationFillMode: "forwards" }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

const TONE_CLASSES: Record<string, string> = {
  brand: "bg-brand-50 text-brand-600",
  emerald: "bg-emerald-50 text-emerald-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  teal: "bg-teal-50 text-teal-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

function MenuItem({
  icon: Icon,
  tone,
  title,
  desc,
  onClick,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASSES;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
      onClick={onClick}
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
        <Icon className="h-5 w-5" strokeWidth={2.1} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-ink-900">{title}</div>
        <div className="text-xs text-ink-400 mt-0.5">{desc}</div>
      </div>
      <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
    </button>
  );
}
