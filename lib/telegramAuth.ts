import crypto from "crypto";

export interface TelegramInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface ParsedInitData {
  user: TelegramInitDataUser;
  authDate: number;
}

/**
 * Проверяет подпись Telegram WebApp initData (см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Возвращает распарсенные данные пользователя, либо null если подпись невалидна.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): ParsedInitData | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const pairs: string[] = [];
  params.forEach((value, key) => {
    pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== hash) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (maxAgeSeconds > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as TelegramInitDataUser;
    return { user, authDate };
  } catch {
    return null;
  }
}

/**
 * В режиме разработки (без реального Telegram-окружения) initData часто отсутствует.
 * Эта функция разрешает "dev bypass" через заголовок X-Debug-Telegram-Id,
 * работающий ТОЛЬКО если NODE_ENV !== "production".
 */
export function devBypassUser(debugId: string | null): ParsedInitData | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!debugId) return null;
  return { user: { id: Number(debugId), first_name: "Dev", username: "dev_user" }, authDate: Date.now() / 1000 };
}
