"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, KeyRound, ShieldAlert } from "lucide-react";

export default function ChangePasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setDismissed(true);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card mb-6 border-amber-200 bg-gradient-to-br from-amber-50 to-white animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <ShieldAlert className="h-4.5 w-4.5" strokeWidth={2.1} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-900">
            Вам выдан временный пароль
          </p>
          <p className="text-sm text-amber-700/90 mt-0.5 mb-3">
            Пожалуйста, задайте свой постоянный пароль для безопасности аккаунта.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label className="label">Новый пароль</label>
              <div className="input-icon-wrap">
                <KeyRound className="input-icon h-4 w-4" strokeWidth={2} />
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button className="btn-primary" disabled={loading}>
              Сохранить
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDismissed(true)}>
              Позже
            </button>
          </form>
          {error && (
            <div className="alert-danger mt-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
