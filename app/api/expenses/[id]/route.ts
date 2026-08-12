import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { expenseStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getCashBalance } from "@/lib/finance";

/**
 * Подтверждение/отклонение заявки сотрудника на расход — только владелец (не доверенное лицо):
 * пользователь явно попросил "владелец должен сам одобрить". До подтверждения расход не
 * учитывается в остатке (см. lib/finance.ts — считает только status: "approved").
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Подтверждать расходы может только владелец", 403);

  const body = await req.json().catch(() => null);
  const parsed = expenseStatusSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const expense = await Expense.findById(params.id);
  if (!expense) return jsonError("Расход не найден", 404);
  if (expense.status !== "pending") return jsonError("Эта заявка уже обработана", 409);

  // Повторная проверка кассы прямо перед одобрением: заявка уже могла пройти проверку в
  // момент подачи (см. app/api/miniapp/expenses/route.ts), но с тех пор кассу могла исчерпать
  // другая одобренная заявка — не даём кассе уйти в минус.
  if (parsed.data.status === "approved" && expense.method === "cash") {
    const cashBalance = await getCashBalance();
    if (expense.amount > cashBalance) {
      return jsonError(`Недостаточно наличных в кассе для одобрения (доступно: ${cashBalance})`, 409);
    }
  }

  const before = expense.status;
  expense.status = parsed.data.status;
  expense.approvedBy = user.identifier;
  expense.approvedAt = new Date();
  await expense.save();

  await logAudit({
    entity: "Expense",
    entityId: expense._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { status: { before, after: expense.status } },
  });

  return NextResponse.json({ expense });
}
