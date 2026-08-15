"use client";

import { useI18n, type Locale } from "./i18n";
import { haptic } from "./telegram";

const OPTIONS: { value: Locale; flag: string; label: string }[] = [
  { value: "uz", flag: "🇺🇿", label: "O'Z" },
  { value: "ru", flag: "🇷🇺", label: "РУ" },
];

/**
 * Переключатель узбекский/русский — виден на каждом экране Mini App (рендерится в
 * app/miniapp/layout.tsx поверх контента), а не только на главном меню, т.к. сотрудник может
 * захотеть сменить язык в середине сценария (например, застряв на непонятном шаге мастера).
 */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex justify-end pt-1 pb-2">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-ink-200 bg-white p-0.5 text-xs font-semibold shadow-xs">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              if (o.value !== locale) haptic.selection();
              setLocale(o.value);
            }}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              locale === o.value ? "bg-brand-600 text-white shadow-sm" : "text-ink-400 hover:text-ink-700"
            }`}
          >
            <span aria-hidden>{o.flag}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
