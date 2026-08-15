/**
 * Миграция на models/Client.ts — заводит по одному Client на каждого арендатора, встречавшегося
 * в StorageRecord ДО появления этой сущности (см. README → «Клиенты и задолженность»), и
 * проставляет clientId на все его StorageRecord/Income/InventoryLedgerEntry/Act.
 *
 * ДО этой миграции личность арендатора вычислялась из телефона/ИНН (см. lib/ownerKey.ts) — эта
 * миграция один раз "замораживает" текущую (на момент запуска) группировку по этому ключу в
 * отдельные документы Client, сохраняя поведение для существующих данных без изменений. После
 * миграции разные клиенты с одинаковым телефоном больше не будут схлопываться — но это уже
 * касается только НОВЫХ записей (см. components/miniapp/NewRecordWizard.tsx).
 *
 * Идемпотентна: обрабатывает только документы без clientId, поэтому повторный запуск безопасен
 * (например, если часть записей появилась уже после первого прогона на старом коде).
 *
 * Запуск: npx tsx scripts/migrateClients.ts  (нужен настроенный .env.local с MONGODB_URI)
 */
import "dotenv/config";
import mongoose from "mongoose";
import { StorageRecord } from "../models/StorageRecord";
import { Income } from "../models/Income";
import { InventoryLedgerEntry } from "../models/InventoryLedgerEntry";
import { Act } from "../models/Act";
import { Client } from "../models/Client";
import { ownerKeyOf } from "../lib/ownerKey";
import type { IGoodsOwner } from "../models/StorageRecord";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI не задан. Скопируйте .env.example в .env.local и заполните.");
  }

  await mongoose.connect(uri);
  console.log("Подключено к MongoDB");

  // clientId уже поставлен на записи, где он есть — обрабатываем только "старые" документы.
  const unmigrated = await StorageRecord.find({ clientId: { $exists: false } })
    .sort({ createdAt: -1 }) // сначала самые свежие — их goodsOwner берём как профиль клиента
    .select("goodsOwner createdAt")
    .lean();

  console.log(`StorageRecord без clientId: ${unmigrated.length}`);

  // legacy ownerKey -> clientId — используется и для самих StorageRecord, и для Income/
  // InventoryLedgerEntry/Act ниже (у них тот же legacy ownerKey денормализован полем).
  const clientIdByOwnerKey = new Map<string, mongoose.Types.ObjectId>();
  let createdCount = 0;

  for (const r of unmigrated as unknown as { _id: mongoose.Types.ObjectId; goodsOwner: IGoodsOwner; createdAt: Date }[]) {
    const key = ownerKeyOf(r.goodsOwner as any);
    let clientId = clientIdByOwnerKey.get(key);
    if (!clientId) {
      // Первая (по сортировке — самая свежая) запись группы даёт самый актуальный профиль —
      // так же вела себя getTenantDetail() до появления Client.
      const client = await Client.create({
        profile: r.goodsOwner,
        createdBy: "migration",
      });
      clientId = client._id;
      clientIdByOwnerKey.set(key, clientId);
      createdCount++;
    }
    await StorageRecord.updateOne({ _id: r._id }, { $set: { clientId } });
  }
  console.log(`Создано новых Client: ${createdCount}`);
  console.log(`StorageRecord обновлено: ${unmigrated.length}`);

  // Income/InventoryLedgerEntry/Act — тот же legacy ownerKey уже денормализован на каждом
  // документе (см. models/Income.ts и т.п.), поэтому clientId проставляется прямым поиском по
  // карте выше, без похода в StorageRecord. Три отдельных вызова вместо цикла по union-массиву
  // моделей — у каждой модели свой строгий generic-тип, mongoose не даёт вызывать find/updateOne
  // через переменную с типом-объединением нескольких Model<...>.
  async function migrateByOwnerKey(
    model: mongoose.Model<{ ownerKey: string }>,
    name: string
  ): Promise<void> {
    const rows = await model.find({ clientId: { $exists: false } }).select("ownerKey").lean();
    let updated = 0;
    let skipped = 0;
    for (const row of rows as unknown as { _id: mongoose.Types.ObjectId; ownerKey: string }[]) {
      const clientId = clientIdByOwnerKey.get(row.ownerKey);
      if (!clientId) {
        // ownerKey не встретился ни в одной StorageRecord (напр. арендатор без записей на
        // момент запуска, или записи уже были удалены) — оставляем как есть, разберётся вручную.
        skipped++;
        continue;
      }
      await model.updateOne({ _id: row._id }, { $set: { clientId } });
      updated++;
    }
    console.log(`${name}: обновлено ${updated}, пропущено (нет совпадения по ownerKey) ${skipped}`);
  }

  await migrateByOwnerKey(Income as unknown as mongoose.Model<{ ownerKey: string }>, "Income");
  await migrateByOwnerKey(InventoryLedgerEntry as unknown as mongoose.Model<{ ownerKey: string }>, "InventoryLedgerEntry");
  await migrateByOwnerKey(Act as unknown as mongoose.Model<{ ownerKey: string }>, "Act");

  console.log("\nГотово.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
