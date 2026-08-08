import { InputFile } from "grammy";
import { getBot } from "@/lib/telegramBot";
import { IStorageRecord } from "@/models/StorageRecord";
import { getGoodsOwnerLinkByPhone, formatRegisteredMessage } from "@/lib/goodsOwnerBot";
import { generateContractBuffer, contractFilename } from "@/lib/contract/contractService";

/**
 * Исходящие уведомления/документы, инициируемые НЕ входящим апдейтом бота, а действием
 * в Mini App (создание записи). Все функции здесь — best-effort: ошибки логируются, но
 * никогда не пробрасываются наружу, чтобы сбой Telegram API (или отсутствие
 * TELEGRAM_BOT_TOKEN в dev-окружении) не ломал сохранение записи в API-роуте.
 */

type RecordForNotify = Pick<
  IStorageRecord,
  "productName" | "quantity" | "unit" | "payment" | "createdAt" | "goodsOwner" | "_id"
>;

/**
 * Часть 2 ТЗ: если для goodsOwner.phone уже есть привязка telegramId (GoodsOwnerLink) —
 * шлём ему уведомление о новой записи. Если привязки нет — просто ничего не делаем.
 * Применимо только к физлицам (у юрлиц нет номера телефона в схеме).
 */
export async function notifyGoodsOwnerRegistered(record: RecordForNotify, containerName: string): Promise<void> {
  try {
    if (record.goodsOwner.type !== "individual") return;
    const link = await getGoodsOwnerLinkByPhone(record.goodsOwner.phone);
    if (!link) return;

    const bot = getBot();
    const text = formatRegisteredMessage(record, containerName);
    await bot.api.sendMessage(Number(link.telegramId), text);
  } catch (err) {
    console.error("notifyGoodsOwnerRegistered: не удалось отправить уведомление владельцу груза:", err);
  }
}

/**
 * Часть 3 ТЗ: сразу после создания записи о физлице-арендаторе бот присылает готовый PDF
 * договора В ЧАТ СОТРУДНИКА, который эту запись только что создал в Mini App (не владельцу
 * груза — это отдельное уведомление выше). У сотрудника telegramId всегда известен, так как
 * это условие входа в Mini App.
 */
export async function sendContractToEmployee(
  employeeTelegramId: string,
  record: RecordForNotify,
  containerName: string
): Promise<void> {
  try {
    if (record.goodsOwner.type !== "individual") return;
    const buffer = await generateContractBuffer(record, containerName);
    const bot = getBot();
    await bot.api.sendDocument(Number(employeeTelegramId), new InputFile(buffer, contractFilename(String(record._id))), {
      caption: "📄 Договор по новой записи (физ. лицо) сформирован автоматически.",
    });
  } catch (err) {
    console.error("sendContractToEmployee: не удалось отправить PDF договора сотруднику:", err);
  }
}
