"use client";

import { useEffect, useState, useCallback } from "react";
import { initTelegramWebApp, miniAppFetch } from "@/components/miniapp/telegram";
import RegisterForm from "@/components/miniapp/RegisterForm";
import PendingScreen from "@/components/miniapp/PendingScreen";
import NewRecordWizard from "@/components/miniapp/NewRecordWizard";

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
    return <div className="pt-16 text-center text-sm text-slate-500">Загрузка…</div>;
  }

  if (error || !me) {
    return (
      <div className="pt-16 text-center text-sm text-red-600 px-4">
        {error || "Не удалось получить данные Telegram. Откройте приложение через бота."}
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
    <div className="pt-10">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Здравствуйте, {me.employee.name}!</h1>
      <p className="text-sm text-slate-500 mb-8">Учёт хранения продукции в контейнерах</p>
      <button className="btn-primary w-full text-base py-3" onClick={() => setShowWizard(true)}>
        ➕ Новая запись
      </button>
    </div>
  );
}
