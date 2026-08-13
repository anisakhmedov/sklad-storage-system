import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Собственная фирма владельца склада, от чьего имени составляется договор/акт ("Сақловчи") —
 * см. lib/contract/firmDefaults.ts::FirmSnapshot (та же форма полей). Владелец может завести
 * несколько фирм; при создании записи в Mini App сотрудник выбирает, от какой фирмы оформляется
 * договор (см. app/api/miniapp/firms/route.ts, components/miniapp/NewRecordWizard.tsx) — снимок
 * реквизитов на момент выбора сохраняется прямо в StorageRecord.issuingFirm, чтобы более позднее
 * редактирование/удаление фирмы не меняло задним числом уже выданные документы.
 */
export interface IFirm {
  _id: Types.ObjectId;
  name: string;
  directorFullName: string;
  directorShortName: string;
  address: string;
  bankBranch: string;
  bankAccount: string;
  inn: string;
  bankCode: string;
  createdBy: string;
  createdAt: Date;
}

const FirmSchema = new Schema<IFirm>({
  name: { type: String, required: true, trim: true },
  directorFullName: { type: String, required: true, trim: true },
  directorShortName: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  bankBranch: { type: String, required: true, trim: true },
  bankAccount: { type: String, required: true, trim: true },
  inn: { type: String, required: true, trim: true },
  bankCode: { type: String, required: true, trim: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Firm: Model<IFirm> = models.Firm || model<IFirm>("Firm", FirmSchema);
