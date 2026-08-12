import { connectDB } from "@/lib/db";
import { StorageRecord, IStorageRecord } from "@/models/StorageRecord";
// Побочный эффект: регистрирует схему "Container" в Mongoose до populate("containerId") ниже.
// В serverless на Vercel каждый API-роут трассируется и бандлится отдельно (@vercel/nft),
// поэтому нельзя полагаться на то, что модель уже была где-то импортирована раньше в процессе.
import "@/models/Container";
import { buildContractFillData, renderContractPdf } from "./generateContract";
import { getNextSequence } from "@/lib/counter";

/**
 * Имя файла — ФИО арендатора + дата договора (см. `record.createdAt`, редактируется на
 * веб-панели, см. app/dashboard/records/page.tsx). Кириллица в имени не проблема для
 * Telegram (grammy InputFile передаёт его как часть multipart-запроса, не HTTP-заголовка);
 * для HTTP-скачивания (app/api/records/[id]/contract/route.ts) используется
 * lib/apiHelpers.ts::contentDispositionHeader поверх этого же базового имени.
 */
export function contractFilename(ownerLabel: string, date: Date): string {
  const safeName = ownerLabel.trim().replace(/\s+/g, "_");
  const dateText = date.toLocaleDateString("ru-RU").replace(/\./g, "-");
  return `Dogovor_${safeName}_${dateText}.pdf`;
}

type LeanRecordWithContainer = IStorageRecord & { containerId: { _id: unknown; name: string } };

/** Общий шаг: собрать PDF, когда запись и название контейнера уже под рукой. */
export async function generateContractBuffer(
  record: Pick<IStorageRecord, "tariff" | "goodsOwner" | "createdAt" | "clientSignaturePng">,
  containerName: string,
  contractNumber: string
) {
  const data = buildContractFillData(record, containerName, contractNumber);
  return renderContractPdf(data);
}

/**
 * Записи, созданные до появления поля `contractNumber` (см. models/StorageRecord.ts), номера
 * не имеют — присваиваем его лениво при первом обращении к договору и сохраняем в БД, чтобы
 * повторные запросы отдавали тот же номер. Год для последовательности берётся текущий (момент
 * первой выдачи документа), а не год исходного создания записи.
 */
async function ensureContractNumber(record: LeanRecordWithContainer): Promise<string> {
  if (record.contractNumber) return record.contractNumber;
  const year = new Date().getFullYear();
  const number = `${await getNextSequence(`contract:${year}`)}-${year}`;
  await StorageRecord.updateOne({ _id: record._id }, { $set: { contractNumber: number } });
  return number;
}

export type ContractLookupError = "not_found" | "not_individual";

/** Для веб-панели и авто-отправки сотруднику сразу после создания записи. */
export async function getContractForRecordId(
  recordId: string
): Promise<{ buffer: Buffer; filename: string } | ContractLookupError> {
  await connectDB();
  const record = (await StorageRecord.findById(recordId)
    .populate("containerId", "name")
    .lean()) as LeanRecordWithContainer | null;
  if (!record) return "not_found";
  if (record.goodsOwner.type !== "individual") return "not_individual";

  const containerName = record.containerId?.name || "—";
  const contractNumber = await ensureContractNumber(record);
  const buffer = await generateContractBuffer(record, containerName, contractNumber);
  return { buffer, filename: contractFilename(record.goodsOwner.fullName, record.createdAt) };
}

/**
 * Для запроса договора самим арендатором в боте: у одного номера телефона может быть
 * несколько записей/договоров — по умолчанию отправляется договор по самой свежей записи
 * (см. README, раздел «Договор по запросу в боте»; вызывающий код на основе `total` решает,
 * упоминать ли в сообщении, что запись не единственная).
 */
export async function findLatestIndividualContractByPhone(phone: string) {
  await connectDB();
  const records = (await StorageRecord.find({ "goodsOwner.type": "individual", "goodsOwner.phone": phone })
    .sort({ createdAt: -1 })
    .populate("containerId", "name")
    .lean()) as unknown as LeanRecordWithContainer[];

  if (records.length === 0) return null;

  const latest = records[0];
  const containerName = latest.containerId?.name || "—";
  const contractNumber = await ensureContractNumber(latest);
  const buffer = await generateContractBuffer(latest, containerName, contractNumber);
  const ownerLabel = latest.goodsOwner.type === "individual" ? latest.goodsOwner.fullName : "—";
  return {
    buffer,
    filename: contractFilename(ownerLabel, latest.createdAt),
    total: records.length,
    createdAt: latest.createdAt,
  };
}
