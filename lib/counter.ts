import { connectDB } from "./db";
import { Counter } from "@/models/Counter";

/**
 * Следующее значение атомарной последовательности по ключу `key` (создаёт её при первом
 * обращении). `$inc` внутри `findOneAndUpdate` — атомарная операция на уровне MongoDB, поэтому
 * при параллельных запросах номера не задваиваются (в отличие от "прочитать текущий максимум
 * и прибавить 1" в коде). Используется для номера договора (см. lib/contract/contractService.ts),
 * ключ включает год — новый год означает новый ключ и отсчёт заново с 1.
 */
export async function getNextSequence(key: string): Promise<number> {
  await connectDB();
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();
  return doc!.seq;
}
