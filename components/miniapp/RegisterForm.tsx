"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";

export default function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await miniAppFetch("/api/miniapp/register", {
        method: "POST",
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка регистрации");
        return;
      }
      onRegistered();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-6">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Регистрация</h1>
      <p className="text-sm text-slate-500 mb-6">
        Укажите имя и номер телефона — заявка будет отправлена владельцу на подтверждение.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Имя</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className="label">Номер телефона</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998901234567"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy || !name || !phone}>
          {busy ? "Отправка…" : "Отправить заявку"}
        </button>
      </form>
    </div>
  );
}
