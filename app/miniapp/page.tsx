"use client";

import { useEffect, useState, useCallback } from "react";
import { initTelegramWebApp, miniAppFetch } from "@/components/miniapp/telegram";
import RegisterForm from "@/components/miniapp/RegisterForm";
import PendingScreen from "@/components/miniapp/PendingScreen";
import NewRecordWizard from "@/components/miniapp/NewRecordWizard";
import { Boxes, Plus, TriangleAlert } from "lucide-react";

type EmployeeStatus = "pending" | "approved" | "rejected";

interface MeResponse {
  telegram: { id: number; firstName?: string; lastName?: string; username?: string };
  employee: { id: string; name: string; phone: string; status: EmployeeStatus } | null;
}

export default function MiniAppPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

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

  if (showWizard) {
    return <NewRecordWizard onExit={() => setShowWizard(false)} />;
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

      <button
        className="btn-primary w-full text-[15px] py-3.5 rounded-2xl"
        onClick={() => setShowWizard(true)}
      >
        <Plus className="h-4.5 w-4.5" strokeWidth={2.25} />
        Новая запись
      </button>
    </div>
  );
}
