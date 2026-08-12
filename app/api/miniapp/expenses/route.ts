import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { expenseCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getCashBalance } from "@/lib/finance";

/**
 * Заявка сотрудника на расход (снятие/зарплата/прочее) — всегда создаётся со статусом
 * "pending" и не влияет на остаток (см. lib/finance.ts), пока владелец не подтвердит на
 * веб-панели (см. app/api/expenses/[id]/route.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = expenseCreateSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);

    await connectDB();

    // Заявка сотрудника остаётся "pending" и сама по себе не трогает остаток (см.
    // lib/finance.ts), но владелец попросил блокировать уже на этапе подачи заявки, а не
    // ждать одобрения — чтобы сотрудник сразу видел, что наличных не хватает.
    if (parsed.data.method === "cash") {
      const cashBalance = await getCashBalance();
      if (parsed.data.amount > cashBalance) {
        return jsonError(`Недостаточно наличных в кассе (доступно: ${cashBalance})`, 400);
      }
    }

    const expense = await Expense.create({
      ...parsed.data,
      createdBy: employee.name,
      createdByRole: "employee",
      status: "pending",
    });

    await logAudit({
      entity: "Expense",
      entityId: expense._id,
      action: "create",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: { type: expense.type, amount: expense.amount, method: expense.method, status: "pending" },
    });

    return NextResponse.json({ expense: { id: String(expense._id) } });
  } catch (err) {
    console.error("POST /api/miniapp/expenses:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
