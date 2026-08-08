"use client";

import { useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";

interface Container {
  id: string;
  name: string;
  description?: string;
}

type Unit = "tonne" | "kg" | "box" | "piece";
type Method = "cash" | "terminal" | "transfer";

const emptyForm = {
  containerId: "",
  productName: "",
  quantity: "",
  unit: "tonne" as Unit,
  ownerFullName: "",
  ownerPhone: "",
  ownerPassport: "",
  ownerPinfl: "",
  amount: "",
  method: "cash" as Method,
};

const STEP_LABELS = ["Контейнер", "Товар", "Владелец груза", "Оплата", "Проверка"];

export default function NewRecordWizard({ onExit }: { onExit: () => void }) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);

  useEffect(() => {
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
  }, []);

  function next() {
    setError(null);
    if (step === 0 && !form.containerId) return setError("Выберите контейнер");
    if (step === 1 && (!form.productName || !form.quantity)) {
      return setError("Заполните наименование и количество");
    }
    if (step === 2 && (!form.ownerFullName || !form.ownerPhone || !form.ownerPassport || !form.ownerPinfl)) {
      return setError("Заполните все данные владельца груза");
    }
    if (step === 3 && !form.amount) return setError("Укажите сумму оплаты");
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await miniAppFetch("/api/miniapp/records", {
        method: "POST",
        body: JSON.stringify({
          containerId: form.containerId,
          productName: form.productName,
          quantity: form.quantity,
          unit: form.unit,
          goodsOwner: {
            fullName: form.ownerFullName,
            phone: form.ownerPhone,
            passportData: form.ownerPassport,
            pinfl: form.ownerPinfl,
          },
          payment: { amount: form.amount, method: form.method },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка сохранения");
        return;
      }
      setSavedScreen(true);
    } finally {
      setBusy(false);
    }
  }

  function startAnother(keepContainer: boolean) {
    setForm({ ...emptyForm, containerId: keepContainer ? form.containerId : "" });
    setStep(0);
    setSavedScreen(false);
  }

  if (savedScreen) {
    return (
      <div className="pt-10 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-lg font-semibold text-slate-800 mb-2">Запись сохранена</h1>
        <p className="text-sm text-slate-500 mb-6">Хотите добавить ещё одну позицию?</p>
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={() => startAnother(true)}>
            Да, тот же контейнер
          </button>
          <button className="btn-secondary w-full" onClick={() => startAnother(false)}>
            Да, другой контейнер
          </button>
          <button className="btn-secondary w-full" onClick={onExit}>
            Нет, завершить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-4">
        <button className="text-sm text-slate-500" onClick={step === 0 ? onExit : back}>
          ← Назад
        </button>
        <span className="text-xs text-slate-400">
          Шаг {step + 1} из {STEP_LABELS.length} · {STEP_LABELS[step]}
        </span>
      </div>

      {step === 0 && (
        <div className="space-y-3">
          <label className="label">Выберите контейнер</label>
          {containers.length === 0 ? (
            <p className="text-sm text-slate-500">Контейнеры ещё не созданы владельцем.</p>
          ) : (
            <div className="space-y-2">
              {containers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setForm({ ...form, containerId: c.id })}
                  className={`w-full text-left rounded-lg border px-3 py-3 ${
                    form.containerId === c.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="font-medium text-slate-800">{c.name}</div>
                  {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <div>
            <label className="label">Наименование товара</label>
            <input
              className="input"
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Количество</label>
              <input
                type="number"
                inputMode="decimal"
                className="input"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="label">Ед. изм.</label>
              <select
                className="input"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value as Unit })}
              >
                <option value="tonne">тонны</option>
                <option value="kg">кг</option>
                <option value="box">ящики</option>
                <option value="piece">штуки</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div>
            <label className="label">ФИО владельца груза</label>
            <input
              className="input"
              value={form.ownerFullName}
              onChange={(e) => setForm({ ...form, ownerFullName: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Телефон</label>
            <input
              className="input"
              value={form.ownerPhone}
              onChange={(e) => setForm({ ...form, ownerPhone: e.target.value })}
              placeholder="+998901234567"
            />
          </div>
          <div>
            <label className="label">Паспортные данные</label>
            <input
              className="input"
              value={form.ownerPassport}
              onChange={(e) => setForm({ ...form, ownerPassport: e.target.value })}
              placeholder="AB1234567"
            />
          </div>
          <div>
            <label className="label">ПИНФЛ</label>
            <input
              className="input"
              value={form.ownerPinfl}
              onChange={(e) => setForm({ ...form, ownerPinfl: e.target.value })}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div>
            <label className="label">Сумма оплаты за хранение</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Способ оплаты</label>
            <select
              className="input"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value as Method })}
            >
              <option value="cash">Наличные</option>
              <option value="terminal">Терминал</option>
              <option value="transfer">Перевод</option>
            </select>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2 text-sm">
          <div className="card">
            <Row label="Контейнер" value={containers.find((c) => c.id === form.containerId)?.name} />
            <Row label="Товар" value={form.productName} />
            <Row label="Количество" value={`${form.quantity} ${form.unit}`} />
            <Row label="Владелец груза" value={form.ownerFullName} />
            <Row label="Телефон владельца" value={form.ownerPhone} />
            <Row label="Паспорт" value={form.ownerPassport} />
            <Row label="ПИНФЛ" value={form.ownerPinfl} />
            <Row label="Оплата" value={`${form.amount} (${form.method})`} />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      <div className="mt-6">
        {step < STEP_LABELS.length - 1 ? (
          <button className="btn-primary w-full" onClick={next}>
            Далее
          </button>
        ) : (
          <button className="btn-primary w-full" onClick={handleSubmit} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить запись"}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value || "—"}</span>
    </div>
  );
}
