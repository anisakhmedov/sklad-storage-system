"use client";

import { useEffect } from "react";

// Тонкая обёртка над window.Telegram.WebApp + fetch-хелпер, который
// автоматически прикладывает initData (или dev-заголовок в режиме разработки).
// Плюс нативные возможности Mini App (шапка/фон под цвет бренда, кнопка "Назад",
// тактильный отклик) — чтобы приложение ощущалось частью Telegram, а не встроенным сайтом.

export type HapticImpactStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
export type HapticNotificationType = "error" | "success" | "warning";

interface TelegramBackButton {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}

interface TelegramHapticFeedback {
  impactOccurred: (style: HapticImpactStyle) => void;
  notificationOccurred: (type: HapticNotificationType) => void;
  selectionChanged: () => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        colorScheme?: "light" | "dark";
        ready: () => void;
        expand: () => void;
        setBackgroundColor?: (color: string) => void;
        setHeaderColor?: (color: string) => void;
        HapticFeedback?: TelegramHapticFeedback;
        BackButton?: TelegramBackButton;
        showAlert?: (message: string) => void;
      };
    };
  }
}

function getWebApp() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp || null;
}

export function getInitData(): string {
  return getWebApp()?.initData || "";
}

// Тот же светлый фирменный фон/шапка, что и у app/globals.css::body и .btn-primary
// (brand-600) — задаём их явно, а не подстраиваемся под цветовую тему пользователя:
// у продукта пока нет тёмной темы, и подстроить нативную шапку Telegram под чужую
// палитру, оставив собственный интерфейс светлым, выглядело бы рассинхронизированным
// сильнее, чем стабильный фирменный цвет независимо от темы Telegram.
const CHROME_HEADER_COLOR = "#2748db";
const CHROME_BG_COLOR = "#f6f7fb";

function applyTelegramChrome() {
  const webApp = getWebApp();
  if (!webApp) return;
  try {
    webApp.setHeaderColor?.(CHROME_HEADER_COLOR);
    webApp.setBackgroundColor?.(CHROME_BG_COLOR);
  } catch {
    // Старая версия клиента Telegram может не знать эти методы — не критично.
  }
}

export function initTelegramWebApp() {
  const webApp = getWebApp();
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  applyTelegramChrome();
}

// Тактильный отклик — доступен только внутри настоящего Telegram (в браузере молча
// не срабатывает). Используется на первичных действиях (сохранить, подтвердить,
// ошибка валидации), чтобы приложение ощущалось нативным, а не веб-страницей.
export const haptic = {
  tap: () => getWebApp()?.HapticFeedback?.impactOccurred("light"),
  selection: () => getWebApp()?.HapticFeedback?.selectionChanged(),
  success: () => getWebApp()?.HapticFeedback?.notificationOccurred("success"),
  error: () => getWebApp()?.HapticFeedback?.notificationOccurred("error"),
};

/**
 * Синхронизирует нативную кнопку "Назад" в шапке Telegram с внутренней навигацией
 * экрана. `onBack` — обработчик текущего "активного" уровня; передавайте `null`, когда
 * этот компонент сейчас показывает вложенный экран, который сам управляет кнопкой (см.
 * components/miniapp/PatrolScreen.tsx — три вложенных уровня, в каждый момент кнопку
 * "держит" ровно один). Вне Telegram (обычный браузер, dev-режим) — no-op, экран
 * продолжает работать через собственную кнопку "Назад" в контенте.
 */
export function useTelegramBackButton(onBack: (() => void) | null | undefined) {
  useEffect(() => {
    const backButton = getWebApp()?.BackButton;
    if (!backButton) return;
    if (!onBack) {
      backButton.hide();
      return;
    }
    const handler = () => {
      haptic.tap();
      onBack();
    };
    backButton.onClick(handler);
    backButton.show();
    return () => {
      backButton.offClick(handler);
      backButton.hide();
    };
  }, [onBack]);
}

// В dev-режиме (запуск не внутри Telegram) initData пустой — тогда используем
// заголовок X-Debug-Telegram-Id с произвольным числовым id, чтобы можно было
// тестировать Mini App локально в обычном браузере.
const DEV_TELEGRAM_ID_KEY = "sklad_dev_telegram_id";

export function getDevTelegramId(): string {
  if (typeof window === "undefined") return "1";
  let id = window.localStorage.getItem(DEV_TELEGRAM_ID_KEY);
  if (!id) {
    id = String(100000 + Math.floor(Math.random() * 900000));
    window.localStorage.setItem(DEV_TELEGRAM_ID_KEY, id);
  }
  return id;
}

export async function miniAppFetch(url: string, options: RequestInit = {}) {
  const initData = getInitData();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (initData) {
    headers.set("X-Telegram-Init-Data", initData);
  } else if (process.env.NODE_ENV !== "production") {
    headers.set("X-Debug-Telegram-Id", getDevTelegramId());
  }
  return fetch(url, { ...options, headers });
}
