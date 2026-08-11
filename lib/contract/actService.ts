import { IStorageRecord } from "@/models/StorageRecord";
import { buildActFillData, renderActPdf } from "./generateAct";

export function actFilename(recordId: string): string {
  return `akt-priema-${recordId}-${Date.now()}.pdf`;
}

/** Акт нигде не хранится — собирается по актуальным данным записи в момент добавления груза. */
export async function generateActBuffer(
  record: Pick<IStorageRecord, "goodsOwner" | "productName" | "unit" | "contractNumber">,
  containerName: string,
  delta: number,
  totalAfter: number
): Promise<Buffer> {
  const data = buildActFillData(record, containerName, delta, totalAfter);
  return renderActPdf(data);
}
