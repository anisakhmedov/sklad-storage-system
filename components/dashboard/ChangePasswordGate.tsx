"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="card mb-6 border-amber-300 bg-amber-50">
      <p className="text-sm text-amber-800 mb-3">
        Вам выдан временный пароль. Пожалуйста, задайте свой постоянный пароль.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Новый пароль</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={loading}>
          Сохранить
        </button>
        <button type="button" className="btn-secondary" onClick={() => setDismissed(true)}>
          Позже
        </button>
        {error && <p className="text-sm text-red-600 w-full">{error}</p>}
      </form>
    </div>
  );
}
