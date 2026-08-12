"use client";

import { useEffect, useState, useCallback } from "react";
import { initTelegramWebApp, miniAppFetch } from "@/components/miniapp/telegram";
import RegisterForm from "@/components/miniapp/RegisterForm";
import PendingScreen from "@/components/miniapp/PendingScreen";
import NewRecordWizard from "@/components/miniapp/NewRecordWizard";
import AddIncomeWizard from "@/components/miniapp/AddIncomeWizard";
import ClientsList from "@/components/miniapp/ClientsList";
import ExpensesScreen from "@/components/miniapp/ExpensesScreen";
import PatrolScreen from "@/components/miniapp/PatrolScreen";
import CellsScreen from "@/components/miniapp/CellsScreen";
import { Boxes, Plus, TriangleAlert, Wallet, ChevronRight, Users, MinusCircle, Thermometer, LayoutGrid } from "lucide-react";

type EmployeeStatus = "pending" | "approved" | "rejected";
type Mode = "menu" | "record" | "income" | "clients" | "expenses" | "patrol" | "cells";

interface MeResponse {
  telegram: { id: number; firstName?: string; lastName?: string; username?: string };
  employee: { id: string; name: string; phone: string; status: EmployeeStatus } | null;
}

export default function MiniAppPage() {
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
        setError(data.error || "Ошибка");
        return;
      }
      setMe(data);
    } catch {
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initTelegramWebApp();
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="pt-20 flex flex-col items-center justify-center gap-3">
        <div className="h-9 w-9 rounded-full border-[3px] border-brand-200 border-t-brand-600 animate-spin" />
        <p className="text-sm text-ink-400">Загрузка…</p>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div className="pt-16 text-center px-4">
        <div className="empty-state-icon bg-rose-100 text-rose-600 mx-auto">
          <TriangleAlert className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <p className="text-sm text-rose-600 mt-1">
          {error || "Не удалось получить данные Telegram. Откройте приложение через бота."}
        </p>
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

  return (
    <div className="pt-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-sm shadow-brand-600/25 mb-5">
        <Boxes className="h-6 w-6" strokeWidth={2.1} />
      </div>
      <h1 className="text-xl font-semibold text-ink-900 tracking-tight mb-1">
        Здравствуйте, {me.employee.name}!
      </h1>
      <p className="text-sm text-ink-400 mb-8">Учёт хранения продукции в контейнерах</p>

      <div className="space-y-3">
        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("record")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Plus className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Новая запись</div>
            <div className="text-xs text-ink-400 mt-0.5">Разместить товар в контейнере</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>

        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("income")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Wallet className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Записать оплату</div>
            <div className="text-xs text-ink-400 mt-0.5">Клиент оплатил хранение</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>

        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("clients")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Users className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Клиенты</div>
            <div className="text-xs text-ink-400 mt-0.5">Товары клиента, задолженность, +/- груз</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>

        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("expenses")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <MinusCircle className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Расходы</div>
            <div className="text-xs text-ink-400 mt-0.5">Заявка на расход — уйдёт владельцу на одобрение</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>

        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("patrol")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <Thermometer className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Обход</div>
            <div className="text-xs text-ink-400 mt-0.5">Температура холодильных камер, 2 раза в день</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>

        <button
          className="w-full flex items-center gap-3.5 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 active:scale-[0.99]"
          onClick={() => setMode("cells")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
            <LayoutGrid className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-ink-900">Камеры контейнеров</div>
            <div className="text-xs text-ink-400 mt-0.5">Отметить камеру как заполненную</div>
          </div>
          <ChevronRight className="h-4.5 w-4.5 text-ink-300 shrink-0" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
