import { Schema, model, models, Model, Types } from "mongoose";

/**
 * Запись обхода холодильной камеры — 2 раза в день, отдельно на КАЖДУЮ камеру (1–8, см.
 * lib/cells.ts::CELL_COUNT) внутри контейнера, сотрудник вписывает температуру и силу тока
 * (ампер) компрессора этой камеры. `date` — календарная дата по Ташкенту (не UTC!) в формате
 * "YYYY-MM-DD", чтобы однозначно определять "сделан ли обход СЕГОДНЯ" независимо от времени
 * суток/часового пояса сервера (см. lib/patrols.ts::tashkentDateString).
 *
 * `cellNumber`/`amperage` необязательны на уровне схемы ради обратной совместимости: записи,
 * созданные ДО этой доработки, были на уровне всего контейнера (без камеры/ампера) — они
 * остаются в БД как есть и просто не участвуют в по-камерном статусе (см.
 * lib/patrols.ts::getTodayPatrolStatus). Новые записи (после доработки) — cellNumber/amperage
 * обязательны на уровне API (см. lib/validation.ts::patrolLogCreateSchema).
 */
export type PatrolPeriod = "morning" | "evening";

export interface IPatrolLog {
  _id: Types.ObjectId;
  containerId: Types.ObjectId;
  cellNumber?: number;
  employeeId: Types.ObjectId;
  period: PatrolPeriod;
  temperature: number;
  amperage?: number;
  date: string;
  createdAt: Date;
}

const PatrolLogSchema = new Schema<IPatrolLog>({
  containerId: { type: Schema.Types.ObjectId, ref: "Container", required: true, index: true },
  cellNumber: { type: Number, min: 1, max: 8 },
  employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  period: { type: String, enum: ["morning", "evening"], required: true },
  temperature: { type: Number, required: true },
  amperage: { type: Number },
  date: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Один обход на контейнер+камеру+период+дату (повторная отправка перезаписывает через upsert,
// см. app/api/miniapp/patrols/route.ts) — не даёт задвоить записи за один и тот же обход этой
// камеры. Легаси-записи (созданные ДО этой доработки, без cellNumber) остаются валидны под
// новым индексом: старый индекс {containerId,period,date} уже гарантировал не более одной такой
// записи на контейнер+период+дату, а MongoDB индексирует отсутствующий cellNumber как null —
// т.е. миграция не создаёт дублей задним числом.
PatrolLogSchema.index({ containerId: 1, cellNumber: 1, period: 1, date: 1 }, { unique: true });

export const PatrolLog: Model<IPatrolLog> = models.PatrolLog || model<IPatrolLog>("PatrolLog", PatrolLogSchema);
