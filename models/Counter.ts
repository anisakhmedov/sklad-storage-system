import { Schema, model, models, Model } from "mongoose";

/**
 * Универсальный атомарный счётчик для последовательных номеров (напр. номер договора,
 * см. lib/counter.ts). `_id` — произвольный ключ последовательности (напр. "contract:2026"),
 * значение сбрасывается сменой ключа (год меняется → новый ключ → счёт заново с 1).
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter: Model<ICounter> = models.Counter || model<ICounter>("Counter", CounterSchema);
