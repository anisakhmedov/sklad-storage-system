"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Boxes, KeyRound, Lock, ShieldCheck, User } from "lucide-react";

const highlights = [
  { icon: Boxes, text: "Контейнеры, товары и владельцы груза — в едином реестре" },
  { icon: ShieldCheck, text: "Роли и права доступа для владельцев и доверенных лиц" },
  { icon: KeyRound, text: "Полная история изменений по каждой записи" },
];

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Не удалось выполнить запрос");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl grid lg:grid-cols-[1.05fr_1fr] rounded-3xl overflow-hidden shadow-popover border border-ink-100 bg-white animate-fade-up">
        {/* Brand panel */}
        <div className="relative hidden lg:flex flex-col justify-between bg-brand-gradient p-10 text-white overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -top-16 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

          <div className="relative">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20">
                <Boxes className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <span className="text-lg font-semibold tracking-tight">Sklad</span>
            </div>

            <h1 className="mt-10 text-[26px] leading-snug font-semibold tracking-tight">
              Учёт хранения продукции в контейнерах
            </h1>
            <p className="mt-3 text-sm text-white/75 leading-relaxed max-w-sm">
              Веб-панель и Telegram Mini App для контроля контейнеров, оплат и сотрудников
              вашего склада — в одном месте.
            </p>
          </div>

          <div className="relative space-y-3.5">
            {highlights.map((h) => (
              <div key={h.text} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
                  <h.icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                </div>
                <p className="text-sm text-white/85 leading-snug">{h.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center p-8 sm:p-10">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Boxes className="h-4.5 w-4.5" strokeWidth={2.25} />
            </div>
            <span className="text-base font-semibold text-ink-900">Sklad</span>
          </div>

          <h2 className="text-xl font-semibold text-ink-900 tracking-tight">Вход в панель</h2>
          <p className="text-sm text-ink-400 mt-1 mb-7">
            Введите данные, выданные владельцем склада
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username или телефон</label>
              <div className="input-icon-wrap">
                <User className="input-icon h-4 w-4" strokeWidth={2} />
                <input
                  className="input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="owner или +998901234567"
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="label">Пароль</label>
              <div className="input-icon-wrap">
                <Lock className="input-icon h-4 w-4" strokeWidth={2} />
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="alert-danger">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 group" disabled={loading}>
              {loading ? (
                "Входим…"
              ) : (
                <>
                  Войти
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-xs text-ink-400 text-center leading-relaxed">
            Доступ к панели выдаётся владельцем склада.
            <br />
            Обратитесь к нему, если у вас нет учётных данных.
          </p>
        </div>
      </div>
    </div>
  );
}
