import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { employeeRegisterSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
  const filter = status ? { status } : {};
  const employees = await Employee.find(filter).sort({ createdAt: -1 }).lean();
  // .lean() отдаёт документы как хранятся в БД, без применения схемных default — у
  // сотрудников, созданных до появления поля containerAccess, его в самой БД ещё нет, и
  // клиент, ожидающий массив (см. app/dashboard/employees/page.tsx), падает на .length.
  const withDefaults = employees.map((e) => ({
    ...e,
    containerAccess: e.containerAccess || [],
    hasPlatformAccess: e.hasPlatformAccess ?? true,
  }));
  return NextResponse.json({ employees: withDefaults });
}

/**
 * Создание сотрудника напрямую с веб-панели, БЕЗ регистрации через Telegram-бота — для
 * персонала, которому не нужен доступ к платформе (напр. учёт зарплаты бухгалтера/грузчика,
 * который ботом не пользуется вообще), см. models/Employee.ts::hasPlatformAccess. Одобрение не
 * требуется (владелец и так создаёт запись сам) — сразу "approved".
 */
export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = employeeRegisterSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const employee = await Employee.create({
    name: parsed.data.name,
    phone: parsed.data.phone,
    status: "approved",
    hasPlatformAccess: false,
  });

  await logAudit({
    entity: "Employee",
    entityId: employee._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: employee.name, phone: employee.phone, hasPlatformAccess: false },
  });

  return NextResponse.json({ employee });
}
