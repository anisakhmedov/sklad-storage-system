import { InputFile } from "grammy";
import { getBot } from "@/lib/telegramBot";
import { IStorageRecord } from "@/models/StorageRecord";
import { IAct, ActKind } from "@/models/Act";
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
  | "productName"
  | "quantity"
  | "unit"
  | "tariff"
  | "createdAt"
  | "goodsOwner"
  | "_id"
  | "contractNumber"
  | "clientSignaturePng"
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
    // На момент вызова номер уже присвоен при создании записи (см. app/api/miniapp/records/route.ts).
    const buffer = await generateContractBuffer(record, containerName, record.contractNumber || "—");
    const bot = getBot();
    const filename = contractFilename(record.goodsOwner.fullName, record.createdAt);
    await bot.api.sendDocument(Number(employeeTelegramId), new InputFile(buffer, filename), {
      caption: "📄 Договор по новой записи (физ. лицо) сформирован автоматически.",
    });
  } catch (err) {
    console.error("sendContractToEmployee: не удалось отправить PDF договора сотруднику:", err);
  }
}

const ACT_CAPTIONS: Record<ActKind, string> = {
  goods_given: "📄 Акт приёма-передачи товара сформирован автоматически.",
  goods_returned: "📄 Акт отдачи товара сформирован автоматически.",
  inventory_given: "📄 Акт передачи инвентаря сформирован автоматически.",
  inventory_returned: "📄 Акт возврата инвентаря сформирован автоматически.",
  box_given: "📄 Акт передачи ящиков сформирован автоматически.",
  box_returned: "📄 Акт возврата ящиков сформирован автоматически.",
};

/**
 * Отправляет сотруднику уже сохранённый акт (см. lib/contract/actPersistence.ts::createAndSaveAct —
 * акт всегда сначала сохраняется целиком в БД, отправка в Telegram — best-effort уведомление
 * поверх уже готового буфера, а не отдельная генерация). Используется для всех видов акта:
 * товар (app/api/miniapp/records/[id]/adjust/route.ts), инвентарь (app/api/miniapp/inventory/route.ts),
 * ящики (app/api/miniapp/boxes/[ownerKey]/route.ts).
 */
export async function sendActToEmployee(employeeTelegramId: string, act: Pick<IAct, "kind" | "pdfBuffer" | "filename">): Promise<void> {
  try {
    const bot = getBot();
    await bot.api.sendDocument(Number(employeeTelegramId), new InputFile(act.pdfBuffer, act.filename), {
      caption: ACT_CAPTIONS[act.kind],
    });
  } catch (err) {
    console.error("sendActToEmployee: не удалось отправить PDF акта сотруднику:", err);
  }
}
