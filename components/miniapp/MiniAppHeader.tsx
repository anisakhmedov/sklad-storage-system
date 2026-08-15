"use client";

import { ArrowLeft } from "lucide-react";
import { useI18n } from "./i18n";
import { useTelegramBackButton } from "./telegram";

/**
 * Единая шапка экрана Mini App — заголовок + кнопка "Назад" (одновременно рисуется в
 * контенте И регистрируется как нативная кнопка "Назад" в шапке Telegram, см.
 * telegram.ts::useTelegramBackButton). Раньше каждый экран собирал этот блок вручную —
 * из-за этого случайные расхождения в отступах/шрифте между экранами. `onBack: null`
 * означает "кнопки сейчас нет" (см. использование во вложенных экранах —
 * PatrolScreen/CellsScreen делегируют владение кнопкой дочернему уровню).
 */
export default function MiniAppHeader({
  title,
  onBack,
  right,
  truncate,
}: {
  title?: React.ReactNode;
  onBack: (() => void) | null;
  right?: React.ReactNode;
  truncate?: boolean;
}) {
  const { t } = useI18n();
  useTelegramBackButton(onBack);

  return (
    <div className="flex items-center gap-2 mb-5">
      {onBack && (
        <button className="btn-icon btn-ghost -ml-2 shrink-0" onClick={onBack} aria-label={t("common.back")}>
          <ArrowLeft className="h-4.5 w-4.5" strokeWidth={2.1} />
        </button>
      )}
      {title && (
        <h1 className={`text-lg font-semibold text-ink-900 tracking-tight flex-1 min-w-0 ${truncate ? "truncate" : ""}`}>
          {title}
        </h1>
      )}
      {!title && <div className="flex-1" />}
      {right}
    </div>
  );
}
