import { connectDB } from "@/lib/db";
import { StorageRecord, IStorageRecord } from "@/models/StorageRecord";
// Побочный эффект: регистрирует схему "Container" в Mongoose до populate("containerId") ниже.
// В serverless на Vercel каждый API-роут трассируется и бандлится отдельно (@vercel/nft),
// поэтому нельзя полагаться на то, что модель уже была где-то импортирована раньше в процессе.
import "@/models/Container";
import { buildContractFillData, renderContractPdf } from "./generateContract";

export function contractFilename(recordId: string): string {
  return `dogovor-${recordId}.pdf`;
}

type LeanRecordWithContainer = IStorageRecord & { containerId: { _id: unknown; name: string } };

/** Общий шаг: собрать PDF, когда запись и название контейнера уже под рукой. */
export async function generateContractBuffer(
  record: Pick<IStorageRecord, "productName" | "quantity" | "unit" | "payment" | "goodsOwner">,
  containerName: string
) {
  const data = buildContractFillData(record, containerName);
  return renderContractPdf(data);
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
  const buffer = await generateContractBuffer(record, containerName);
  return { buffer, filename: contractFilename(String(record._id)) };
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
  const buffer = await generateContractBuffer(latest, containerName);
  return {
    buffer,
    filename: contractFilename(String(latest._id)),
    total: records.length,
    createdAt: latest.createdAt,
  };
}
