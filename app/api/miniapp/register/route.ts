import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { resolveTelegramUser } from "@/lib/miniAuth";
import { employeeRegisterSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";

export async function POST(req: NextRequest) {
  const tgUser = resolveTelegramUser(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);

  const body = await req.json().catch(() => null);
  const parsed = employeeRegisterSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const telegramId = String(tgUser.user.id);
  const existing = await Employee.findOne({ telegramId });
  if (existing) {
    return NextResponse.json({
      employee: {
        id: String(existing._id),
        name: existing.name,
        phone: existing.phone,
        status: existing.status,
      },
    });
  }

  const employee = await Employee.create({
    name: parsed.data.name,
    phone: parsed.data.phone,
    telegramId,
    telegramUsername: tgUser.user.username,
    status: "pending",
  });

  return NextResponse.json({
    employee: {
      id: String(employee._id),
      name: employee.name,
      phone: employee.phone,
      status: employee.status,
    },
  });
}
