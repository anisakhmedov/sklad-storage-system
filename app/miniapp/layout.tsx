import type { Viewport } from "next";
import Script from "next/script";
import { LocaleProvider } from "@/components/miniapp/i18n";

// maximumScale/userScalable — Mini App открывается внутри WKWebView Telegram: без этого
// на iOS тап в любое текстовое поле мельче 16px автоматически зумит всю страницу
// ("приближается к полю ввода") и её потом приходится руками отдалять обратно. Класс
// miniapp-shell ниже — вторая, более надёжная линия защиты от того же эффекта (см.
// app/globals.css — там же объяснение, почему один только viewport не всегда достаточен).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <LocaleProvider>
        {/* env(safe-area-inset-*) — отступы под чёлку/жест-бар на iOS, внутри WebView
            Telegram эти CSS-переменные так же доступны, как в обычном Safari. */}
        <div
          className="miniapp-shell min-h-screen bg-ink-50 max-w-md mx-auto px-4"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          {children}
        </div>
      </LocaleProvider>
    </>
  );
}
