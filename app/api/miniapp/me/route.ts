import { NextRequest, NextResponse } from "next/server";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";

export async function GET(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);

  return NextResponse.json({
    telegram: {
      id: tgUser.user.id,
      firstName: tgUser.user.first_name,
      lastName: tgUser.user.last_name,
      username: tgUser.user.username,
    },
    employee: employee
      ? {
          id: String(employee._id),
          name: employee.name,
          phone: employee.phone,
          status: employee.status,
        }
      : null,
  });
}
