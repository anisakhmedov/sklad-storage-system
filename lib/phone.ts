/**
 * Нормализация номера телефона для сравнения между `StorageRecord.goodsOwner.phone`,
 * `GoodsOwnerLink.phone` и номером, который Telegram присылает при `request_contact`.
 *
 * Убирает пробелы/скобки/дефисы и приводит к формату `+998XXXXXXXXX`. Так как заказчик
 * работает в Узбекистане, 9-значный номер без кода страны (`901234567`) трактуется как
 * узбекский и дополняется `+998`. Это упрощение задокументировано в README — при выходе
 * за пределы одной страны нормализацию стоит заменить на полноценную библиотеку
 * (например, `libphonenumber-js`).
 */
export function normalizePhone(raw: string): string {
  if (!raw) return "";

  let s = raw.trim().replace(/[\s()\-]/g, "");
  if (!s) return "";

  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (!s.startsWith("+")) {
    if (s.startsWith("998") && s.length === 12) {
      s = "+" + s;
    } else if (/^\d{9}$/.test(s)) {
      // локальный номер без кода страны, напр. "901234567"
      s = "+998" + s;
    } else {
      s = "+" + s.replace(/^\+*/, "");
    }
  }

  return s;
}

/**
 * Фильтр ввода для полей номера телефона (Mini App) — оставляет только цифры и один
 * ведущий "+", остальное отбрасывается по мере набора. Не путать с normalizePhone() выше:
 * та приводит УЖЕ введённый номер к сравнимому виду, эта — не даёт напечатать в поле ничего,
 * кроме цифр, пока пользователь ещё набирает номер.
 */
export function onlyPhoneChars(value: string): string {
  return (value.startsWith("+") ? "+" : "") + value.replace(/\D/g, "");
}
