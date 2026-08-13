import { connectDB } from "./db";
import { PatrolLog, PatrolPeriod } from "@/models/PatrolLog";
import { DEFAULT_CELL_COUNT, cellNumbersForCount } from "./cells";

/**
 * Обход холодильных камер 2 раза в день — вся логика времени завязана на Ташкент (UTC+5,
 * без перевода времени), а не на часовой пояс сервера (Vercel — UTC). Тот же сдвиг
 * используется в vercel.json для расписания cron-напоминаний (см. README).
 */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

function tashkentParts(date: Date): { dateString: string; hour: number } {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const dateString = shifted.toISOString().slice(0, 10);
  const hour = shifted.getUTCHours();
  return { dateString, hour };
}

export function tashkentDateString(date: Date = new Date()): string {
  return tashkentParts(date).dateString;
}

export const PATROL_WINDOWS: Record<PatrolPeriod, { startHour: number; endHour: number }> = {
  morning: { startHour: 8, endHour: 10 },
  evening: { startHour: 18, endHour: 20 },
};

export const PATROL_LABELS: Record<PatrolPeriod, string> = {
  morning: "Обход дневной",
  evening: "Обход вечерний",
};

/** Окно обхода прошло (текущий час по Ташкенту ≥ конца окна) — используется для красной индикации. */
export function isPatrolWindowPassed(period: PatrolPeriod, date: Date = new Date()): boolean {
  return tashkentParts(date).hour >= PATROL_WINDOWS[period].endHour;
}

export interface PatrolCellStatus {
  number: number;
  morningDone: boolean;
  eveningDone: boolean;
}

export interface PatrolStatusRow {
  containerId: string;
  containerName: string;
  cells: PatrolCellStatus[];
  // Контейнер целиком считается "сделан" за период только когда сделаны ВСЕ 8 камер —
  // используется мини-аппом для сводного статуса (components/miniapp/PatrolScreen.tsx).
  morningDone: boolean;
  eveningDone: boolean;
}

/**
 * Статус обходов на сегодня (по Ташкенту) для списка контейнеров — по каждой камере отдельно
 * (см. models/PatrolLog.ts), количество камер берётся индивидуально на контейнер (см.
 * models/Container.ts::cellCount; параметр cellCount необязателен — по умолчанию
 * DEFAULT_CELL_COUNT для контейнеров, созданных до этой доработки). Легаси-записи без
 * cellNumber (созданные до перехода на по-камерный учёт) не попадают ни в одну камеру и не
 * отмечают контейнер как пройденный — это ожидаемо: старые обходы были на уровне контейнера и
 * с новой (по-камерной) моделью несопоставимы напрямую.
 */
export async function getTodayPatrolStatus(
  containers: Array<{ id: string; name: string; cellCount?: number }>
): Promise<PatrolStatusRow[]> {
  await connectDB();
  const today = tashkentDateString();
  const logs = await PatrolLog.find({
    date: today,
    containerId: { $in: containers.map((c) => c.id) },
    cellNumber: { $ne: null },
  }).lean();

  const doneSet = new Set(logs.map((l) => `${String(l.containerId)}::${l.cellNumber}::${l.period}`));
  return containers.map((c) => {
    const cellNumbers = cellNumbersForCount(c.cellCount ?? DEFAULT_CELL_COUNT);
    const cells: PatrolCellStatus[] = cellNumbers.map((n) => ({
      number: n,
      morningDone: doneSet.has(`${c.id}::${n}::morning`),
      eveningDone: doneSet.has(`${c.id}::${n}::evening`),
    }));
    return {
      containerId: c.id,
      containerName: c.name,
      cells,
      morningDone: cells.every((cell) => cell.morningDone),
      eveningDone: cells.every((cell) => cell.eveningDone),
    };
  });
}
