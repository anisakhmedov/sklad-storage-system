import Script from "next/script";
import { LocaleProvider } from "@/components/miniapp/i18n";
import LanguageSwitcher from "@/components/miniapp/LanguageSwitcher";

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <LocaleProvider>
        <div className="min-h-screen bg-ink-50 max-w-md mx-auto px-4 py-4 pb-10">
          <LanguageSwitcher />
          {children}
        </div>
      </LocaleProvider>
    </>
  );
}
