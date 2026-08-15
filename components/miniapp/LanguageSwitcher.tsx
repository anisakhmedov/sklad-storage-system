"use client";

import { useI18n, type Locale } from "./i18n";

const OPTIONS: { value: Locale; label: string }[] = [
  { value: "uz", label: "O'Z" },
  { value: "ru", label: "РУ" },
];

/**
 * Переключатель узбекский/русский — виден на каждом экране Mini App (рендерится в
 * app/miniapp/layout.tsx поверх контента), а не только на главном меню, т.к. сотрудник может
 * захотеть сменить язык в середине сценария (например, застряв на непонятном шаге мастера).
 */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex justify-end pt-2 pb-1">
      <div className="inline-flex rounded-full border border-ink-200 bg-white p-0.5 text-xs font-medium shadow-sm">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setLocale(o.value)}
            className={`px-2.5 py-1 rounded-full transition-colors ${
              locale === o.value ? "bg-brand-600 text-white" : "text-ink-400 hover:text-ink-700"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
