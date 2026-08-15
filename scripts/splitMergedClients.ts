/**
 * Одноразовая чистка данных, записанных ДО models/Client.ts: если у одного Client оказалось
 * несколько РАЗНЫХ людей (типичный случай — общий "запасной" телефон склада, вписанный разным
 * реальным клиентам до этой доработки, см. README → «Клиенты и задолженность»), этот скрипт
 * распознаёт их по несовпадению ФИО/паспорта/ПИНФЛ (для юрлиц — наименования/ИНН) внутри одной
 * карточки и разносит их по отдельным Client, переставляя clientId на StorageRecord/Income/
 * InventoryLedgerEntry/Act. Один "представитель" (сигнатура текущего профиля Client) остаётся
 * на месте — остальные сигнатуры получают новые карточки.
 *
 * По умолчанию — DRY RUN (только печатает план, ничего не меняет). Чтобы применить:
 *   npx tsx scripts/splitMergedClients.ts --apply
 */
import "dotenv/config";
import mongoose from "mongoose";
import { StorageRecord } from "../models/StorageRecord";
import { Income } from "../models/Income";
import { InventoryLedgerEntry } from "../models/InventoryLedgerEntry";
import { Act } from "../models/Act";
import { Client } from "../models/Client";
import type { IGoodsOwner } from "../models/StorageRecord";

const APPLY = process.argv.includes("--apply");

function signatureOf(owner: IGoodsOwner): string {
  if (owner.type === "individual") {
    return [
      "individual",
      owner.fullName.trim().toLowerCase(),
      owner.passportData.trim().toUpperCase().replace(/\s+/g, ""),
      owner.pinfl.trim(),
    ].join("|");
  }
  return ["company", owner.companyName.trim().toLowerCase(), owner.inn.trim()].join("|");
}

function labelOf(owner: IGoodsOwner): string {
  return owner.type === "individual" ? owner.fullName : owner.companyName;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI не задан");
  await mongoose.connect(uri);
  console.log(APPLY ? "Режим: ПРИМЕНИТЬ изменения" : "Режим: ТОЛЬКО ПРОСМОТР (dry-run) — добавьте --apply, чтобы применить");

  const records = await StorageRecord.find()
    .select("clientId goodsOwner createdAt")
    .sort({ createdAt: -1 }) // самая свежая запись каждой сигнатуры станет профилем новой карточки
    .lean();

  const byClient = new Map<string, typeof records>();
  for (const r of records) {
    const key = String(r.clientId);
    if (!byClient.has(key)) byClient.set(key, []);
    byClient.get(key)!.push(r);
  }

  let clientsInspected = 0;
  let clientsSplit = 0;
  let newClientsCreated = 0;
  let recordsReassigned = 0;

  for (const [clientIdStr, group] of byClient) {
    const signatures = new Map<string, typeof records>(); // signature -> records
    for (const r of group) {
      const sig = signatureOf(r.goodsOwner as IGoodsOwner);
      if (!signatures.has(sig)) signatures.set(sig, []);
      signatures.get(sig)!.push(r);
    }
    clientsInspected++;
    if (signatures.size <= 1) continue; // одна и та же личность — всё в порядке, пропускаем

    clientsSplit++;
    const client = await Client.findById(clientIdStr);
    if (!client) {
      console.log(`⚠️  Client ${clientIdStr} не найден (удалён?) — пропускаю группу из ${group.length} записей`);
      continue;
    }
    const currentSig = signatureOf(client.profile);
    const currentLabel = labelOf(client.profile);

    console.log(`\nClient ${clientIdStr} (${currentLabel}) — найдено ${signatures.size} разных людей на ${group.length} записях:`);

    for (const [sig, sigRecords] of signatures) {
      const sampleOwner = sigRecords[0].goodsOwner as IGoodsOwner;
      const label = labelOf(sampleOwner);

      if (sig === currentSig) {
        console.log(`  = ${label} (${sigRecords.length} зап.) — остаётся на текущей карточке ${clientIdStr}`);
        continue;
      }

      console.log(`  + ${label} (${sigRecords.length} зап.) — ${APPLY ? "переносится" : "будет перенесён"} на НОВУЮ карточку`);

      if (!APPLY) continue;

      const newClient = await Client.create({ profile: sampleOwner, createdBy: "split-merged-clients" });
      newClientsCreated++;
      const recordIds = sigRecords.map((r) => r._id);
      await StorageRecord.updateMany({ _id: { $in: recordIds } }, { $set: { clientId: newClient._id } });
      recordsReassigned += recordIds.length;

      // Income/InventoryLedgerEntry/Act этой же (старой) карточки — переносим те, чей
      // денормализованный ownerLabel совпадает с этим человеком (ownerLabel = fullName/companyName
      // на момент операции, см. models/Income.ts) и ещё указывают на старый clientId.
      for (const [Model, name] of [
        [Income, "Income"],
        [InventoryLedgerEntry, "InventoryLedgerEntry"],
        [Act, "Act"],
      ] as const) {
        const res = await (Model as any).updateMany(
          { clientId: client._id, ownerLabel: label },
          { $set: { clientId: newClient._id } }
        );
        if (res.modifiedCount > 0) console.log(`    ↳ ${name}: перенесено ${res.modifiedCount}`);
      }
    }
  }

  console.log(`\nКарточек проверено: ${clientsInspected}`);
  console.log(`Карточек с несколькими людьми: ${clientsSplit}`);
  if (APPLY) {
    console.log(`Новых карточек создано: ${newClientsCreated}`);
    console.log(`Записей переставлено: ${recordsReassigned}`);
  } else {
    console.log("\nЭто был просмотр — ничего не изменено. Запустите с --apply, чтобы применить.");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
