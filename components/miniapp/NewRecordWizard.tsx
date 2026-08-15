"use client";

import { useEffect, useState } from "react";
import { miniAppFetch, haptic, useTelegramBackButton } from "./telegram";
import { useI18n } from "./i18n";
import CellGrid, { CellGridCell } from "./CellGrid";
import ContractPreview from "./ContractPreview";
import SignaturePad from "./SignaturePad";
import { buildContractFillData, placeholderMap } from "@/lib/contract/placeholders";
import { normalizePhone, onlyPhoneChars } from "@/lib/phone";
import {
  TARIFF_TYPES,
  DEFAULT_TARIFF_RATES,
  isTariffCompatibleWithUnit,
  suggestedEndDate,
  TariffType,
} from "@/lib/tariff";
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
  Search,
  X,
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

/** Один результат GET /api/miniapp/owners/search — goodsOwner как он хранится на записи
 * (см. models/StorageRecord.ts::IGoodsOwner), плюс ownerKey для React key/выбора. */
type OwnerSearchResult = {
  ownerKey: string;
  goodsOwner:
    | {
        type: "individual";
        fullName: string;
        phone: string;
        passportData: string;
        pinfl: string;
        passportIssueDate: string;
        passportIssuedBy: string;
      }
    | { type: "company"; companyName: string; inn: string; directorName: string };
};

/** Date -> "yyyy-mm-dd" для value <input type="date">. */
function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Дата выдачи паспорта хранится в form/на записи строкой "12.05.2020" (как в самом паспорте,
 * см. lib/contract/placeholders.ts — подставляется в договор как есть), а не ISO-датой — но
 * поле должно быть настоящим календарём (<input type="date">), а не текстом "введи вручную".
 * Эти две функции переводят туда-обратно между форматом хранения и форматом value календаря.
 */
function ddmmyyyyToDateInputValue(value: string): string {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function dateInputValueToDdmmyyyy(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Только цифры — для ПИНФЛ/ИНН, где буквы физически невозможны. */
function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const emptyForm = {
  containerId: "",
  cellNumber: null as number | null,
  productName: "",
  quantity: "",
  // "кг" по умолчанию — вес обычно вводят в килограммах; дефолт "тонны" приводил к тому, что
  // сотрудник забывал переключить единицу и вводил, например, 1000 (имея в виду кг), а система
  // считала это 1000 тонн = 1 000 000 кг в сводной таблице (см. lib/tenantMatrix.ts::toKg).
  unit: "kg" as Unit,
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
  // Планируемая дата, когда клиент заберёт товар — подсказывается по тарифу (см.
  // lib/tariff.ts::suggestedEndDate) при выборе типа тарифа, но сотрудник может поправить
  // или вовсе очистить. Строка "yyyy-mm-dd" (значение <input type="date">), не Date — как и
  // quantity выше в этой форме. Пусто — сервер сам подставит подсказку при сохранении.
  expectedEndDate: "",
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

export default function NewRecordWizard({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const STEP_META: Record<StepKind, { label: string; icon: typeof Boxes }> = {
    container: { label: t("newRecord.stepContainer"), icon: Boxes },
    cell: { label: t("newRecord.stepCell"), icon: LayoutGrid },
    product: { label: t("newRecord.stepProduct"), icon: Package },
    owner: { label: t("newRecord.stepOwner"), icon: UserRound },
    tariff: { label: t("newRecord.stepTariff"), icon: Wallet },
    firm: { label: t("newRecord.stepFirm"), icon: Landmark },
    contract: { label: t("newRecord.stepContract"), icon: FileText },
    signature: { label: t("newRecord.stepSignature"), icon: PenLine },
    review: { label: t("newRecord.stepReview"), icon: ClipboardCheck },
  };

  const [containers, setContainers] = useState<Container[]>([]);
  const [cells, setCells] = useState<CellGridCell[]>([]);
  const [cellsLoading, setCellsLoading] = useState(false);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedScreen, setSavedScreen] = useState(false);

  // Поиск уже существовавших владельцев груза на шаге "owner" — повторное назначение клиента
  // без ввода паспорта/реквизитов с нуля (см. GET /api/miniapp/owners/search). Отдельное от
  // form состояние — сам поисковый запрос не сохраняется в записи.
  const [ownerQuery, setOwnerQuery] = useState("");
  const [ownerResults, setOwnerResults] = useState<OwnerSearchResult[]>([]);
  const [ownerSearching, setOwnerSearching] = useState(false);
  const [ownerPicked, setOwnerPicked] = useState<string | null>(null); // ownerKey выбранного — прячет список после выбора

  const steps = stepsFor(form.ownerType, firms.length);
  const kind = steps[step];

  // Нативная кнопка "Назад" Telegram зеркалит шаги мастера — на первом шаге закрывает
  // визард, дальше листает назад по шагам; на экране "готово" не нужна (см.
  // telegram.ts::useTelegramBackButton).
  useTelegramBackButton(savedScreen ? null : step === 0 ? onExit : back);

  // Debounce 300мс, минимум 2 символа (см. GET /api/miniapp/owners/search — сервер тоже
  // отсекает короткие запросы).
  useEffect(() => {
    setOwnerPicked(null);
    if (ownerQuery.trim().length < 2) {
      setOwnerResults([]);
      return;
    }
    setOwnerSearching(true);
    const timer = setTimeout(() => {
      miniAppFetch(`/api/miniapp/owners/search?q=${encodeURIComponent(ownerQuery.trim())}`)
        .then((r) => r.json())
        .then((d) => setOwnerResults(d.owners || []))
        .catch(() => setOwnerResults([]))
        .finally(() => setOwnerSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [ownerQuery]);

  function pickOwner(picked: OwnerSearchResult) {
    setOwnerPicked(picked.ownerKey);
    setOwnerResults([]);
    if (picked.goodsOwner.type === "individual") {
      setForm({
        ...form,
        ownerType: "individual",
        ownerFullName: picked.goodsOwner.fullName,
        ownerPhone: picked.goodsOwner.phone,
        ownerPassport: picked.goodsOwner.passportData,
        ownerPinfl: picked.goodsOwner.pinfl,
        ownerPassportIssueDate: picked.goodsOwner.passportIssueDate,
        ownerPassportIssuedBy: picked.goodsOwner.passportIssuedBy,
      });
    } else {
      setForm({
        ...form,
        ownerType: "company",
        companyName: picked.goodsOwner.companyName,
        companyInn: picked.goodsOwner.inn,
        companyDirector: picked.goodsOwner.directorName,
      });
    }
  }

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

  function fail(message: string) {
    haptic.error();
    setError(message);
  }

  function next() {
    setError(null);
    if (kind === "container" && !form.containerId) return fail(t("newRecord.selectContainer"));
    if (kind === "cell" && !form.cellNumber) return fail(t("newRecord.selectCell"));
    if (kind === "product") {
      if (!form.productName.trim()) return fail(t("newRecord.productNameRequired"));
      const qty = Number(form.quantity);
      if (!form.quantity || Number.isNaN(qty) || qty <= 0) {
        return fail(t("newRecord.quantityPositive"));
      }
    }
    if (kind === "owner") {
      if (form.ownerType === "individual") {
        // Собираем ВСЕ незаполненные поля разом — иначе сотрудник видит общую фразу
        // "заполните всё", жмёт "Далее" снова, находит следующее пустое поле и так по кругу.
        const missing: string[] = [];
        if (!form.ownerFullName.trim()) missing.push(t("newRecord.missingFullName"));
        if (!form.ownerPhone.trim()) missing.push(t("newRecord.missingPhone"));
        if (!form.ownerPassport.trim()) missing.push(t("newRecord.missingPassport"));
        if (!form.ownerPinfl.trim()) missing.push(t("newRecord.missingPinfl"));
        if (!form.ownerPassportIssueDate.trim()) missing.push(t("newRecord.missingPassportIssueDate"));
        if (!form.ownerPassportIssuedBy.trim()) missing.push(t("newRecord.missingPassportIssuedBy"));
        if (missing.length > 0) return fail(t("newRecord.fillFields", { fields: missing.join(", ") }));

        // Формат — только когда поле уже заполнено (пустое поле уже отловлено выше).
        const normalizedPhone = normalizePhone(form.ownerPhone);
        if (!/^\+998\d{9}$/.test(normalizedPhone)) {
          return fail(t("newRecord.invalidPhone"));
        }
        if (!/^\d{14}$/.test(form.ownerPinfl.trim())) {
          return fail(t("newRecord.invalidPinfl"));
        }
      } else {
        const missing: string[] = [];
        if (!form.companyName.trim()) missing.push(t("newRecord.missingCompanyName"));
        if (!form.companyInn.trim()) missing.push(t("newRecord.missingInn"));
        if (!form.companyDirector.trim()) missing.push(t("newRecord.missingCompanyDirector"));
        if (missing.length > 0) return fail(t("newRecord.fillFields", { fields: missing.join(", ") }));
      }
    }
    if (kind === "tariff") {
      const rate = Number(form.tariffRate);
      if (!form.tariffRate || Number.isNaN(rate) || rate < 0) {
        return fail(t("newRecord.invalidRate"));
      }
    }
    if (kind === "firm" && !form.firmId) return fail(t("newRecord.selectFirm"));
    if (kind === "signature" && !form.clientSignaturePng) return fail(t("newRecord.signatureRequired"));
    haptic.selection();
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    haptic.selection();
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
          // Пусто — не отправляем: сервер сам подставит подсказку по тарифу (см.
          // app/api/miniapp/records/route.ts).
          ...(form.expectedEndDate ? { expectedEndDate: new Date(form.expectedEndDate).toISOString() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        haptic.error();
        setError(data.error || t("newRecord.saveError"));
        return;
      }
      haptic.success();
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
        <h1 className="text-lg font-semibold text-ink-900 mb-2">{t("newRecord.savedTitle")}</h1>
        <p className="text-sm text-ink-400 mb-2 leading-relaxed px-2">
          {form.ownerType === "individual" ? t("newRecord.savedIndividual") : t("newRecord.savedCompany")}
        </p>
        <p className="text-sm text-ink-400 mb-6">{t("newRecord.addAnotherQ")}</p>
        <div className="space-y-2">
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={() => startAnother(true)}>
            {t("newRecord.sameContainer")}
          </button>
          <button className="btn-secondary w-full py-3 rounded-2xl" onClick={() => startAnother(false)}>
            {t("newRecord.otherContainer")}
          </button>
          <button className="btn-ghost w-full py-3 rounded-2xl" onClick={onExit}>
            {t("newRecord.finish")}
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
          aria-label={t("common.back")}
        >
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
        <span className="text-xs font-medium text-ink-400">
          {t("newRecord.stepCounter", { current: step + 1, total: steps.length })}
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
              <p className="text-sm text-ink-500">{t("newRecord.noContainers")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {containers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    haptic.selection();
                    setForm({ ...form, containerId: c.id, cellNumber: null });
                  }}
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
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> {t("newRecord.cellLegendFree")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> {t("newRecord.cellLegendOccupied")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> {t("newRecord.cellLegendFull")}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {kind === "product" && (
        <div className="space-y-3">
          <div>
            <label className="label">{t("newRecord.productNameLabel")}</label>
            <input
              className="input"
              value={form.productName}
              onChange={(e) => setForm({ ...form, productName: e.target.value })}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">{t("newRecord.quantityLabel")}</label>
              <input
                type="number"
                inputMode="decimal"
                className="input"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="label">{t("newRecord.unitLabel")}</label>
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
                <option value="kg">{t("unit.kg")}</option>
                <option value="tonne">{t("unit.tonne")}</option>
                <option value="box">{t("unit.box")}</option>
                <option value="piece">{t("unit.piece")}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {kind === "owner" && (
        <div className="space-y-3">
          <div>
            <label className="label">{t("newRecord.ownerAlreadyLabel")}</label>
            <div className="input-icon-wrap relative">
              <Search className="input-icon h-4 w-4" strokeWidth={2} />
              <input
                className="input"
                value={ownerQuery}
                onChange={(e) => setOwnerQuery(e.target.value)}
                placeholder={t("newRecord.ownerSearchPlaceholder")}
              />
              {ownerQuery && (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-500"
                  onClick={() => {
                    setOwnerQuery("");
                    setOwnerResults([]);
                  }}
                  aria-label={t("newRecord.clearAria")}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
            {ownerSearching && <p className="text-xs text-ink-400 mt-1.5">{t("newRecord.searching")}</p>}
            {!ownerSearching && ownerResults.length > 0 && (
              <div className="mt-1.5 space-y-1.5">
                {ownerResults.map((o) => (
                  <button
                    key={o.ownerKey}
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      pickOwner(o);
                    }}
                    className="w-full text-left rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 hover:bg-ink-50 transition-colors"
                  >
                    <div className="font-medium text-ink-900 text-sm">
                      {o.goodsOwner.type === "individual" ? o.goodsOwner.fullName : o.goodsOwner.companyName}
                    </div>
                    <div className="text-xs text-ink-400">
                      {o.goodsOwner.type === "individual" ? o.goodsOwner.phone : `${t("newRecord.innPrefix")} ${o.goodsOwner.inn}`}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!ownerSearching && ownerQuery.trim().length >= 2 && ownerResults.length === 0 && !ownerPicked && (
              <p className="text-xs text-ink-400 mt-1.5">{t("newRecord.noOwnersFound")}</p>
            )}
            {ownerPicked && (
              <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} /> {t("newRecord.ownerFilled")}
              </p>
            )}
          </div>

          <label className="label">{t("newRecord.tenantTypeLabel")}</label>
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
              {t("newRecord.individualFull")}
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
              {t("newRecord.companyFull")}
            </button>
          </div>

          {form.ownerType === "individual" ? (
            <>
              <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.individualHint")}</p>
              <div>
                <label className="label">{t("newRecord.fullNameLabel")}</label>
                <input
                  className="input"
                  value={form.ownerFullName}
                  onChange={(e) => setForm({ ...form, ownerFullName: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.phoneLabel")}</label>
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={form.ownerPhone}
                  onChange={(e) => setForm({ ...form, ownerPhone: onlyPhoneChars(e.target.value) })}
                  placeholder="+998901234567"
                  maxLength={13}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.passportLabel")}</label>
                <input
                  className="input"
                  value={form.ownerPassport}
                  onChange={(e) => setForm({ ...form, ownerPassport: e.target.value })}
                  placeholder="AB1234567"
                />
              </div>
              <div>
                <label className="label">{t("newRecord.pinflLabel")}</label>
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.ownerPinfl}
                  onChange={(e) => setForm({ ...form, ownerPinfl: onlyDigits(e.target.value) })}
                  maxLength={14}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.passportIssueDateLabel")}</label>
                <input
                  className="input"
                  type="date"
                  value={ddmmyyyyToDateInputValue(form.ownerPassportIssueDate)}
                  onChange={(e) => setForm({ ...form, ownerPassportIssueDate: dateInputValueToDdmmyyyy(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.passportIssuedByLabel")}</label>
                <input
                  className="input"
                  value={form.ownerPassportIssuedBy}
                  onChange={(e) => setForm({ ...form, ownerPassportIssuedBy: e.target.value })}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.companyHint")}</p>
              <div>
                <label className="label">{t("newRecord.companyNameLabel")}</label>
                <input
                  className="input"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.innLabel")}</label>
                <input
                  className="input"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.companyInn}
                  onChange={(e) => setForm({ ...form, companyInn: onlyDigits(e.target.value) })}
                  maxLength={9}
                />
              </div>
              <div>
                <label className="label">{t("newRecord.companyDirectorLabel")}</label>
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
          <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.tariffHint")}</p>
          <div>
            <label className="label">{t("newRecord.tariffTypeLabel")}</label>
            <div className="space-y-2">
              {TARIFF_TYPES.filter((tt) => isTariffCompatibleWithUnit(tt, form.unit)).map((tt) => (
                <button
                  key={tt}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    const suggestion = suggestedEndDate(tt, new Date());
                    setForm({
                      ...form,
                      tariffType: tt,
                      tariffRate: String(DEFAULT_TARIFF_RATES[tt]),
                      expectedEndDate: suggestion ? toDateInputValue(suggestion) : "",
                    });
                  }}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    form.tariffType === tt
                      ? "border-brand-600 bg-brand-50 text-brand-700 font-medium"
                      : "border-ink-200 bg-white text-ink-600"
                  }`}
                >
                  {t(`tariff.${tt}`)}
                  {form.tariffType === tt && <CheckCircle2 className="h-4 w-4" strokeWidth={2} />}
                </button>
              ))}
            </div>
            {(form.unit === "box" || form.unit === "piece") && (
              <p className="text-xs text-ink-400 mt-1.5">
                {t("newRecord.tariffUnavailableForUnit", { unit: t(`unit.${form.unit}`) })}
              </p>
            )}
          </div>
          <div>
            <label className="label">{t("newRecord.rateLabel")}</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={form.tariffRate}
              onChange={(e) => setForm({ ...form, tariffRate: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{t("newRecord.expectedEndDateLabel")}</label>
            <input
              type="date"
              className="input"
              value={form.expectedEndDate}
              onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })}
            />
            <p className="text-xs text-ink-400 mt-1">{t("newRecord.expectedEndDateHint")}</p>
          </div>
        </div>
      )}

      {kind === "firm" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.firmHint")}</p>
          <div className="space-y-2">
            {firms.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  haptic.selection();
                  setForm({ ...form, firmId: f.id });
                }}
                className={`w-full text-left rounded-2xl border px-4 py-3.5 transition-colors ${
                  form.firmId === f.id ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-ink-900">{f.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5">
                      {t("newRecord.firmDirectorPrefix")}
                      {f.directorFullName}
                    </div>
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
          <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.contractHint")}</p>
          <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white p-3.5">
            <ContractPreview map={contractPreviewMap} />
          </div>
        </div>
      )}

      {kind === "signature" && (
        <div className="space-y-3">
          <p className="text-xs text-ink-400 leading-relaxed">{t("newRecord.signatureHint")}</p>
          <SignaturePad
            value={form.clientSignaturePng}
            onChange={(dataUrl) => setForm({ ...form, clientSignaturePng: dataUrl })}
          />
        </div>
      )}

      {kind === "review" && (
        <div className="space-y-2 text-sm">
          <div className="card">
            <Row label={t("newRecord.reviewContainer")} value={containers.find((c) => c.id === form.containerId)?.name} />
            <Row label={t("newRecord.reviewCell")} value={form.cellNumber ? String(form.cellNumber) : undefined} />
            {firms.length > 0 && <Row label={t("newRecord.reviewFirm")} value={selectedFirm?.name || t("newRecord.reviewDefaultFirm")} />}
            <Row label={t("newRecord.reviewProduct")} value={form.productName} />
            <Row label={t("newRecord.reviewQuantity")} value={`${form.quantity} ${form.unit}`} />
            <Row label={t("newRecord.reviewTenantType")} value={form.ownerType === "individual" ? t("common.individual") : t("common.company")} />
            {form.ownerType === "individual" ? (
              <>
                <Row label={t("newRecord.reviewOwner")} value={form.ownerFullName} />
                <Row label={t("newRecord.reviewOwnerPhone")} value={form.ownerPhone} />
                <Row label={t("newRecord.reviewPassport")} value={form.ownerPassport} />
                <Row label={t("newRecord.reviewPinfl")} value={form.ownerPinfl} />
                <Row label={t("newRecord.reviewIssueDate")} value={form.ownerPassportIssueDate} />
                <Row label={t("newRecord.reviewIssuedBy")} value={form.ownerPassportIssuedBy} />
              </>
            ) : (
              <>
                <Row label={t("newRecord.reviewCompany")} value={form.companyName} />
                <Row label={t("newRecord.reviewInn")} value={form.companyInn} />
                <Row label={t("newRecord.reviewDirector")} value={form.companyDirector} />
              </>
            )}
            <Row
              label={t("newRecord.reviewTariff")}
              value={`${new Intl.NumberFormat("ru-RU").format(Number(form.tariffRate) || 0)} ${t(`tariff.${form.tariffType}_short`)}`}
              last
            />
          </div>
          {form.ownerType === "individual" && form.clientSignaturePng && (
            <div className="card">
              <p className="text-xs text-ink-400 mb-1.5">{t("newRecord.signatureCaption")}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, не файл из /public */}
              <img
                src={form.clientSignaturePng}
                alt={t("newRecord.signatureCaption")}
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
            {kind === "contract" ? t("newRecord.acknowledged") : t("newRecord.next")}
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        ) : (
          <button className="btn-primary w-full py-3 rounded-2xl" onClick={handleSubmit} disabled={busy}>
            {busy ? t("common.saving") : t("newRecord.saveRecord")}
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
