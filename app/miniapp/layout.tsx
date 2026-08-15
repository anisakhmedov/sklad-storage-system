import Script from "next/script";
import { LocaleProvider } from "@/components/miniapp/i18n";
import LanguageSwitcher from "@/components/miniapp/LanguageSwitcher";

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <LocaleProvider>
        {/* env(safe-area-inset-*) — отступы под чёлку/жест-бар на iOS, внутри WebView
            Telegram эти CSS-переменные так же доступны, как в обычном Safari. */}
        <div
          className="min-h-screen bg-ink-50 max-w-md mx-auto px-4"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <LanguageSwitcher />
          {children}
        </div>
      </LocaleProvider>
    </>
  );
}
