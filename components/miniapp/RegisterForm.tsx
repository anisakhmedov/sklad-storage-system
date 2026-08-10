"use client";

import { useState } from "react";
import { miniAppFetch } from "./telegram";
import { UserRound, Phone, AlertCircle, ArrowRight } from "lucide-react";

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
    <div className="pt-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-sm shadow-brand-600/25 mb-5">
        <UserRound className="h-6 w-6" strokeWidth={2.1} />
      </div>
      <h1 className="text-xl font-semibold text-ink-900 tracking-tight mb-1">Регистрация</h1>
      <p className="text-sm text-ink-400 mb-7 leading-relaxed">
        Укажите имя и номер телефона — заявка будет отправлена владельцу на подтверждение.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Имя</label>
          <div className="input-icon-wrap">
            <UserRound className="input-icon h-4 w-4" strokeWidth={2} />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        </div>
        <div>
          <label className="label">Номер телефона</label>
          <div className="input-icon-wrap">
            <Phone className="input-icon h-4 w-4" strokeWidth={2} />
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998901234567"
            />
          </div>
        </div>
        {error && (
          <div className="alert-danger">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}
        <button className="btn-primary w-full py-3 rounded-2xl" disabled={busy || !name || !phone}>
          {busy ? (
            "Отправка…"
          ) : (
            <>
              Отправить заявку
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
