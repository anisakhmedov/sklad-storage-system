import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Учёт хранения продукции в контейнерах",
  description: "Веб-панель и Telegram Mini App для учёта хранения продукции в контейнерах",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
