"use client";

import { useEffect, useState } from "react";
import { miniAppFetch } from "./telegram";
import CellGrid, { CellGridCell } from "./CellGrid";
import ContractPreview from "./ContractPreview";
import SignaturePad from "./SignaturePad";
import { buildContractFillData, placeholderMap } from "@/lib/contract/placeholders";
import { TARIFF_TYPES, TARIFF_LABELS, DEFAULT_TARIFF_RATES, isTariffCompatibleWithUnit, TariffType, formatTariffText } from "@/lib/tariff";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Boxes,
  LayoutGrid,
  Package,
  UserRound,
  Building2,
  Wallet,
  FileText,
  PenLine,
  ClipboardCheck,
  Landmark,
} from "lucide-react";

interface Container {
  id: string;
  name: string;
  description?: string;
}

interface Firm {
  id: string;
  name: string;
  directorFullName: string;
  directorShortName: string;
  address: string;
  bankBranch: string;
  bankAccount: string;
  inn: string;
  bankCode: string;
}

type Unit = "tonne" | "kg" | "box" | "piece";
type OwnerType = "individual" | "company";

const emptyForm = {
  containerId: "",
  cellNumber: null as number | null,
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
  // PNG data URL подписи клиента (см. components/miniapp/SignaturePad.tsx) — только для физлиц.
  clientSignaturePng: null as string | null,
  // От чьего имени (какая фирма владельца) составляется договор/акт — см. models/Firm.ts.
  // Пусто, если фирма ещё не заведена или единственная (тогда выбирается автоматически, без шага).
  firmId: "",
};

// "Договор" и "Подпись" существуют только для физлиц (юрлицам договор не формируется —
// см. lib/contract/generateContract.ts) — список шагов пересчитывается на каждый рендер по
// текущему form.ownerType, поэтому переключение типа арендатора на шаге "owner" всегда
// корректно меняет хвост списка. Шаг "firm" появляется, только если у владельца заведено
// ≥2 фирм — при 0 фирм используется DEFAULT_FIRM, при 1 она выбирается автоматически.
type StepKind = "container" | "cell" | "product" | "owner" | "tariff" | "firm" | "contract" | "signature" | "review";

function stepsFor(ownerType: OwnerType, firmsCount: number): StepKind[] {
  const steps: StepKind[] = ["container", "cell", "product", "owner", "tariff"];
  if (firmsCount > 1) steps.push("firm");
  if (ownerType === "individual") steps.push("contract", "signature");
  steps.push("review");
  return steps;
}

const STEP_META: Record<StepKind, { label: string; icon: typeof Boxes }> = {
  container: { label: "Контейнер", icon: Boxes },
  cell: { label: "Камера", icon: LayoutGrid },
  product: { label: "Товар", icon: Package },
  owner: { label: "Владелец груза", icon: UserRound },
  tariff: { label: "Тариф", icon: Wallet },
  firm: { label: "Фирма", icon: Landmark },
  contract: { label: "Договор", icon: FileText },
  signature: { label: "Подпись", icon: PenLine },
  review: { label: "Проверка", icon: ClipboardCheck },
};

export default function NewRecordWizard({ onExit }: { onExit: () => void }) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [cells, setCells] = useState<CellGridCell[]>([]);
  const [cellsLoading, setCellsLoading] = useState(false);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);

  const steps = stepsFor(form.ownerType, firms.length);
  const kind = steps[step];

  useEffect(() => {
    miniAppFetch("/api/miniapp/containers")
      .then((r) => r.json())
      .then((d) => setContainers(d.containers || []));
    miniAppFetch("/api/miniapp/firms")
      .then((r) => r.json())
      .then((d) => setFirms(d.firms || []));
  }, []);

  // Если фирма всего одна — выбираем её автоматически, без отдельного шага в мастере.
  useEffect(() => {
    if (firms.length === 1 && !form.firmId) {
      setForm((f) => ({ ...f, firmId: firms[0].id }));
    }
  }, [firms, form.firmId]);

  // Сетка камер конкретного контейнера — подгружается сразу при выборе контейнера
  // (шаг "container"), чтобы шаг "cell" открывался уже с готовыми данными.
  useEffect(() => {
    if (!form.containerId) {
      setCells([]);
      return;
    }
    setCellsLoading(true);
    miniAppFetch(`/api/miniapp/containers/${form.containerId}/cells`)
      .then((r) => r.json())
      .then((d) => setCells(d.cells || []))
      .finally(() => setCellsLoading(false));
  }, [form.containerId]);

  function next() {
    setError(null);
    if (kind === "container" && !form.containerId) return setError("Выберите контейнер");
    if (kind === "cell" && !form.cellNumber) return setError("Выберите камеру");
    if (kind === "product" && (!form.productName || !form.quantity)) {
      return setError("Заполните наименование и количество");
    }
    if (kind === "owner") {
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
    if (kind === "tariff" && !form.tariffRate) return setError("Укажите ставку тарифа");
    if (kind === "firm" && !form.firmId) return setError("Выберите, от какой фирмы оформляется договор");
    if (kind === "signature" && !form.clientSignaturePng) return setError("Клиент должен расписаться");
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
          cellNumber: form.cellNumber,
          productName: form.productName,
          quantity: form.quantity,
          unit: form.unit,
          goodsOwner,
          tariff: { type: form.tariffType, rate: form.tariffRate },
          // Подпись обязательна для физлиц — проверено на предыдущем шаге ("signature") и
          // ещё раз на сервере (lib/validation.ts::storageRecordCreateSchema).
          ...(form.ownerType === "individual" ? { clientSignaturePng: form.clientSignaturePng } : {}),
          firmId: form.firmId || undefined,
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
      <div className="pt-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h1 className="text-lg font-semibold text-ink-900 mb-2">Запись сохранена</h1>
        <p className="text-sm text-ink-400 mb-2 leading-relaxed px-2">
          {form.ownerType === "individual"
            ? "PDF договора отправлен вам в этот чат."
            : "Данные юридического лица сохранены. Договор для юрлиц не формируется."}
        </p>
        <p className="text-sm text-ink-400 mb-6">Хотите добавить ещё одну позицию?</p>
        <div className="space-y-2">
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={() => startAnother(true)}>
            Да, тот же контейнер
          </button>
          <button className="btn-secondary w-full py-3 rounded-2xl" onClick={() => startAnother(false)}>
            Да, другой контейнер
          </button>
          <button className="btn-ghost w-full py-3 rounded-2xl" onClick={onExit}>
            Нет, завершить
          </button>
        </div>
      </div>
    );
  }

  const StepIcon = STEP_META[kind].icon;

  // Заполненный текст договора для шага "contract" — читается клиентом на экране сотрудника
  // до подписи. Номер договора ещё неизвестен (присваивается только при сохранении записи,
  // см. app/api/miniapp/records/route.ts) — на превью показываем прочерк, итоговый PDF
  // получит настоящий номер. Вычисляется всегда (не только на шаге "contract") — дёшево,
  // а форма всё равно уже содержит все нужные поля к этому моменту мастера.
  const selectedFirm = firms.find((f) => f.id === form.firmId);
  const contractPreviewMap = placeholderMap(
    buildContractFillData(
      {
        tariff: { type: form.tariffType, rate: Number(form.tariffRate) || 0 },
        goodsOwner: {
          type: "individual",
          fullName: form.ownerFullName,
          phone: form.ownerPhone,
          passportData: form.ownerPassport,
          pinfl: form.ownerPinfl,
          passportIssueDate: form.ownerPassportIssueDate,
          passportIssuedBy: form.ownerPassportIssuedBy,
        },
        createdAt: new Date(),
        issuingFirm: selectedFirm,
      },
      containers.find((c) => c.id === form.containerId)?.name || "—",
      "—"
    )
  );

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between mb-3">
        <button
          className="btn-icon btn-ghost -ml-2"
          onClick={step === 0 ? onExit : back}
          aria-label="Назад"
        >
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <span className="text-xs font-medium text-ink-400">
          Шаг {step + 1} из {steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1.5 mb-5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? "bg-brand-600" : "bg-ink-200"
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 shrink-0">
          <StepIcon className="h-4 w-4" strokeWidth={2.1} />
        </div>
        <h2 className="text-base font-semibold text-ink-900">{STEP_META[kind].label}</h2>
      </div>

      {kind === "container" && (
        <div className="space-y-3">
          {containers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Boxes className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <p className="text-sm text-ink-500">Контейнеры ещё не созданы владельцем.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {containers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setForm({ ...form, containerId: c.id, cellNumber: null })}
                  className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                    form.containerId === c.id
                      ? "border-brand-600 bg-brand-50"
                      : "border-ink-200 bg-white hover:bg-ink-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-ink-900">{c.name}</div>
                      {c.description && <div className="text-xs text-ink-400 mt-0.5">{c.description}</div>}
                    </div>
                    {form.containerId === c.id && (
                      <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {kind === "cell" && (
        <div className="space-y-3">
          {cellsLoading ? (
            <div className="space-y-2.5">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="skeleton h-16 w-full" />
              ))}
            </div>
          ) : (
            <>
              <CellGrid
                cells={cells}
                selected={form.cellNumber}
                onSelect={(n) => setForm({ ...form, cellNumber: n })}
              />
              <div className="flex items-center gap-4 text-xs text-ink-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> свободна
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> есть груз
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> заполнена
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {kind === "product" && (
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

      {kind === "owner" && (
        <div className="space-y-3">
          <label className="label">Тип арендатора</label>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                form.ownerType === "individual"
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-500"
              }`}
              onClick={() => setForm({ ...form, ownerType: "individual" })}
            >
              <UserRound className="h-4 w-4" strokeWidth={2} />
              Физическое лицо
            </button>
            <button
              type="button"
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                form.ownerType === "company"
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-white text-ink-500"
              }`}
              onClick={() => setForm({ ...form, ownerType: "company" })}
            >
              <Building2 className="h-4 w-4" strokeWidth={2} />
              Юридическое лицо
            </button>
          </div>

          {form.ownerType === "individual" ? (
            <>
              <p className="text-xs text-ink-400 leading-relaxed">
                Для физлиц автоматически формируется договор — паспортные данные и ПИНФЛ
                подставляются в его текст, а на следующих шагах клиент читает договор и
                расписывается.
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
              <p className="text-xs text-ink-400 leading-relaxed">
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

      {kind === "tariff" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">
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
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    form.tariffType === t
                      ? "border-brand-600 bg-brand-50 text-brand-700 font-medium"
                      : "border-ink-200 bg-white text-ink-600"
                  }`}
                >
                  {TARIFF_LABELS[t]}
                  {form.tariffType === t && <CheckCircle2 className="h-4 w-4" strokeWidth={2} />}
                </button>
              ))}
            </div>
            {(form.unit === "box" || form.unit === "piece") && (
              <p className="text-xs text-ink-400 mt-1.5">
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

      {kind === "firm" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">
            От чьего имени (какая ваша фирма) оформляется договор/акт по этой записи.
          </p>
          <div className="space-y-2">
            {firms.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setForm({ ...form, firmId: f.id })}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                  form.firmId === f.id ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-ink-900">{f.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5">Директор: {f.directorFullName}</div>
                  </div>
                  {form.firmId === f.id && <CheckCircle2 className="h-5 w-5 text-brand-600 shrink-0" strokeWidth={2} />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === "contract" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">
            Передайте телефон клиенту — пусть прочитает договор до конца, затем нажмите
            «Ознакомлен».
          </p>
          <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-3.5">
            <ContractPreview map={contractPreviewMap} />
          </div>
        </div>
      )}

      {kind === "signature" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">
            Клиент расписывается сам — передайте ему телефон.
          </p>
          <SignaturePad
            value={form.clientSignaturePng}
            onChange={(dataUrl) => setForm({ ...form, clientSignaturePng: dataUrl })}
          />
        </div>
      )}

      {kind === "review" && (
        <div className="space-y-2 text-sm">
          <div className="card">
            <Row label="Контейнер" value={containers.find((c) => c.id === form.containerId)?.name} />
            <Row label="Камера" value={form.cellNumber ? String(form.cellNumber) : undefined} />
            {firms.length > 0 && <Row label="Фирма" value={selectedFirm?.name || "По умолчанию"} />}
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
              last
            />
          </div>
          {form.ownerType === "individual" && form.clientSignaturePng && (
            <div className="card">
              <p className="text-xs text-ink-400 mb-1.5">Подпись клиента</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, не файл из /public */}
              <img
                src={form.clientSignaturePng}
                alt="Подпись клиента"
                className="h-16 rounded-lg border border-ink-200 bg-white"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="alert-danger mt-3">
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6">
        {step < steps.length - 1 ? (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={next}>
            {kind === "contract" ? "Ознакомлен" : "Далее"}
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={handleSubmit} disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить запись"}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2 ${last ? "" : "border-b border-ink-100"}`}>
      <span className="text-ink-400 shrink-0">{label}</span>
      <span className="text-ink-900 font-medium text-right">{value || "—"}</span>
    </div>
  );
}
