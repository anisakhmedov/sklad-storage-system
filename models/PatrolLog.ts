import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Запись обхода холодильной камеры (контейнера) — 2 раза в день, сотрудник вписывает только
 * температуру. `date` — календарная дата по Ташкенту (не UTC!) в формате "YYYY-MM-DD", чтобы
 * однозначно определять "сделан ли обход СЕГОДНЯ" независимо от времени суток/часового пояса
 * сервера (см. lib/patrols.ts::tashkentDateString).
 */
export type PatrolPeriod = "morning" | "evening";

export interface IPatrolLog {
  _id: Types.ObjectId;
  containerId: Types.ObjectId;
  employeeId: Types.ObjectId;
  period: PatrolPeriod;
  temperature: number;
  date: string;
  createdAt: Date;
}

const PatrolLogSchema = new Schema<IPatrolLog>({
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  period: { type: String, enum: ["morning", "evening"], required: true },
  temperature: { type: Number, required: true },
  date: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Один обход на контейнер+период+дату (повторная отправка перезаписывает через upsert,
// см. app/api/miniapp/patrols/route.ts) — не даёт задвоить записи за один и тот же обход.
PatrolLogSchema.index({ containerId: 1, period: 1, date: 1 }, { unique: true });

export const PatrolLog: Model<IPatrolLog> = models.PatrolLog || model<IPatrolLog>("PatrolLog", PatrolLogSchema);
