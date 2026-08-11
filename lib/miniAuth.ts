import { NextRequest } from "next/server";
import { verifyTelegramInitData, devBypassUser, ParsedInitData } from "./telegramAuth";
import { connectDB } from "./db";
import { Employee, IEmployee } from "@/models/Employee";

/** Достаёт и проверяет пользователя Telegram из заголовков запроса Mini App. */
export function resolveTelegramUser(req: NextRequest): ParsedInitData | null {
  const initData = req.headers.get("x-telegram-init-data");
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (initData && botToken) {
    const verified = verifyTelegramInitData(initData, botToken);
    if (verified) return verified;
  }

  // dev-режим: позволяет тестировать Mini App локально без реального Telegram
  const debugId = req.headers.get("x-debug-telegram-id");
  return devBypassUser(debugId);
}

export async function resolveEmployee(req: NextRequest) {
  const tgUser = resolveTelegramUser(req);
  if (!tgUser) return { tgUser: null, employee: null };

  await connectDB();
  const employee = await Employee.findOne({ telegramId: String(tgUser.user.id) }).lean();
  return { tgUser, employee };
}

/**
 * Пустой `containerAccess` = доступ ко всем контейнерам (см. models/Employee.ts), непустой —
 * только к перечисленным. Используется во всех miniapp-роутах, отдающих/принимающих данные
 * по конкретному контейнеру (см. README-план по доступу сотрудников к контейнерам).
 */
export function employeeCanAccessContainer(
  employee: Pick<IEmployee, "containerAccess">,
  containerId: string
): boolean {
  if (!employee.containerAccess || employee.containerAccess.length === 0) return true;
  return employee.containerAccess.some((id) => String(id) === String(containerId));
}

/** Список разрешённых контейнеров для фильтров в БД, или undefined — если доступ не ограничен. */
export function allowedContainerIds(employee: Pick<IEmployee, "containerAccess">): string[] | undefined {
  if (!employee.containerAccess || employee.containerAccess.length === 0) return undefined;
  return employee.containerAccess.map((id) => String(id));
}
