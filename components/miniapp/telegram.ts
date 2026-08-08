"use client";

// Тонкая обёртка над window.Telegram.WebApp + fetch-хелпер, который
// автоматически прикладывает initData (или dev-заголовок в режиме разработки).

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        setBackgroundColor?: (color: string) => void;
        HapticFeedback?: { notificationOccurred: (type: string) => void };
        showAlert?: (message: string) => void;
      };
    };
  }
}

export function getInitData(): string {
  if (typeof window === "undefined") return "";
  return window.Telegram?.WebApp?.initData || "";
}

export function initTelegramWebApp() {
  if (typeof window === "undefined") return;
  const webApp = window.Telegram?.WebApp;
  webApp?.ready();
  webApp?.expand();
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
