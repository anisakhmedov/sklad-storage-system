import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";

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
  const withDefaults = employees.map((e) => ({ ...e, containerAccess: e.containerAccess || [] }));
  return NextResponse.json({ employees: withDefaults });
}
