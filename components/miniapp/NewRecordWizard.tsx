"use client";

import { useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import { TARIFF_TYPES, TARIFF_LABELS, DEFAULT_TARIFF_RATES, isTariffCompatibleWithUnit, TariffType, formatTariffText } from "@/lib/tariff";

interface Container {
  id: string;
  name: string;
  description?: string;
}

type Unit = "tonne" | "kg" | "box" | "piece";
type OwnerType = "individual" | "company";

const emptyForm = {
  containerId: "",
  productName: "",
  quantity: "",
  unit: "tonne" as Unit,
  ownerType: "individual" as OwnerType,
  // физическое лицо
  ownerFullName: "",
  ownerPhone: "",
  ownerPassport: "",
  ownerPinfl: "",
  ownerPassportIssueDate: "",
  ownerPassportIssuedBy: "",
  // юридическое лицо
  companyName: "",
  companyInn: "",
  companyDirector: "",
  // тариф — договорённые условия оплаты; сама оплата вносится позже, отдельно
  // (см. /dashboard/income), поэтому здесь только ставка, не сумма и не способ оплаты.
  tariffType: "per_day" as TariffType,
  tariffRate: String(DEFAULT_TARIFF_RATES.per_day),
};

const STEP_LABELS = ["Контейнер", "Товар", "Владелец груза", "Тариф", "Проверка"];

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
    if (step === 2) {
      if (form.ownerType === "individual") {
        if (
          !form.ownerFullName ||
          !form.ownerPhone ||
          !form.ownerPassport ||
          !form.ownerPinfl ||
          !form.ownerPassportIssueDate ||
          !form.ownerPassportIssuedBy
        ) {
          return setError("Заполните все данные владельца груза (физ. лицо)");
        }
      } else {
        if (!form.companyName || !form.companyInn || !form.companyDirector) {
          return setError("Заполните все данные владельца груза (юр. лицо)");
        }
      }
    }
    if (step === 3 && !form.tariffRate) return setError("Укажите ставку тарифа");
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
      const goodsOwner =
        form.ownerType === "individual"
          ? {
              type: "individual" as const,
              fullName: form.ownerFullName,
              phone: form.ownerPhone,
              passportData: form.ownerPassport,
              pinfl: form.ownerPinfl,
              passportIssueDate: form.ownerPassportIssueDate,
              passportIssuedBy: form.ownerPassportIssuedBy,
            }
          : {
              type: "company" as const,
              companyName: form.companyName,
              inn: form.companyInn,
              directorName: form.companyDirector,
            };

      const res = await miniAppFetch("/api/miniapp/records", {
        method: "POST",
        body: JSON.stringify({
          containerId: form.containerId,
          productName: form.productName,
          quantity: form.quantity,
          unit: form.unit,
          goodsOwner,
          tariff: { type: form.tariffType, rate: form.tariffRate },
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
        <p className="text-sm text-slate-500 mb-2">
          {form.ownerType === "individual"
            ? "PDF договора отправлен вам в этот чат."
            : "Данные юридического лица сохранены. Договор для юрлиц не формируется."}
        </p>
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
                onChange={(e) => {
                  const unit = e.target.value as Unit;
                  const stillCompatible = isTariffCompatibleWithUnit(form.tariffType, unit);
                  setForm({
                    ...form,
                    unit,
                    ...(stillCompatible ? {} : { tariffType: "per_day", tariffRate: String(DEFAULT_TARIFF_RATES.per_day) }),
                  });
                }}
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
          <label className="label">Тип арендатора</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                form.ownerType === "individual"
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setForm({ ...form, ownerType: "individual" })}
            >
              Физическое лицо
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                form.ownerType === "company"
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              onClick={() => setForm({ ...form, ownerType: "company" })}
            >
              Юридическое лицо
            </button>
          </div>

          {form.ownerType === "individual" ? (
            <>
              <p className="text-xs text-slate-400">
                Для физлиц автоматически формируется договор — паспортные данные и ПИНФЛ
                подставляются в его текст.
              </p>
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
                <label className="label">Номер паспорта</label>
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
              <div>
                <label className="label">Дата выдачи паспорта</label>
                <input
                  className="input"
                  value={form.ownerPassportIssueDate}
                  onChange={(e) => setForm({ ...form, ownerPassportIssueDate: e.target.value })}
                  placeholder="12.05.2020"
                />
              </div>
              <div>
                <label className="label">Кем выдан паспорт</label>
                <input
                  className="input"
                  value={form.ownerPassportIssuedBy}
                  onChange={(e) => setForm({ ...form, ownerPassportIssuedBy: e.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-400">
                Для юрлиц договор не формируется — данные только сохраняются.
              </p>
              <div>
                <label className="label">Наименование фирмы</label>
                <input
                  className="input"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="label">ИНН</label>
                <input
                  className="input"
                  value={form.companyInn}
                  onChange={(e) => setForm({ ...form, companyInn: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Имя и фамилия директора</label>
                <input
                  className="input"
                  value={form.companyDirector}
                  onChange={(e) => setForm({ ...form, companyDirector: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Это договорённые условия оплаты за хранение, а не сама оплата — фактические
            платежи вносятся позже на веб-панели (арендатор может заплатить не сразу).
          </p>
          <div>
            <label className="label">Тип тарифа</label>
            <div className="space-y-2">
              {TARIFF_TYPES.filter((t) => isTariffCompatibleWithUnit(t, form.unit)).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setForm({ ...form, tariffType: t, tariffRate: String(DEFAULT_TARIFF_RATES[t]) })
                  }
                  className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${
                    form.tariffType === t
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {TARIFF_LABELS[t]}
                </button>
              ))}
            </div>
            {(form.unit === "box" || form.unit === "piece") && (
              <p className="text-xs text-slate-400 mt-1">
                Тарифы «за кг» недоступны для единицы «{form.unit === "box" ? "ящики" : "штуки"}» — вес неизвестен.
              </p>
            )}
          </div>
          <div>
            <label className="label">Ставка, сум</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={form.tariffRate}
              onChange={(e) => setForm({ ...form, tariffRate: e.target.value })}
            />
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-2 text-sm">
          <div className="card">
            <Row label="Контейнер" value={containers.find((c) => c.id === form.containerId)?.name} />
            <Row label="Товар" value={form.productName} />
            <Row label="Количество" value={`${form.quantity} ${form.unit}`} />
            <Row label="Тип арендатора" value={form.ownerType === "individual" ? "Физ. лицо" : "Юр. лицо"} />
            {form.ownerType === "individual" ? (
              <>
                <Row label="Владелец груза" value={form.ownerFullName} />
                <Row label="Телефон владельца" value={form.ownerPhone} />
                <Row label="Паспорт" value={form.ownerPassport} />
                <Row label="ПИНФЛ" value={form.ownerPinfl} />
                <Row label="Дата выдачи" value={form.ownerPassportIssueDate} />
                <Row label="Кем выдан" value={form.ownerPassportIssuedBy} />
              </>
            ) : (
              <>
                <Row label="Фирма" value={form.companyName} />
                <Row label="ИНН" value={form.companyInn} />
                <Row label="Директор" value={form.companyDirector} />
              </>
            )}
            <Row
              label="Тариф"
              value={formatTariffText({ type: form.tariffType, rate: Number(form.tariffRate) || 0 })}
            />
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
