/**
 * Декодирование PNG-подписи клиента, присланной из Mini App (см.
 * components/miniapp/SignaturePad.tsx, canvas.toDataURL("image/png")). Node-only
 * (использует Buffer) — импортируется только из серверного кода
 * (app/api/miniapp/records/route.ts), никогда из клиентских компонентов.
 */

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

/** Возвращает декодированный Buffer, либо null если строка не является PNG data URL. */
export function decodePngDataUrl(dataUrl: string): Buffer | null {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) return null;
  try {
    const buffer = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}
