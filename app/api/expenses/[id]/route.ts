import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { expenseStatusSchema, expenseUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getCashBalance } from "@/lib/finance";

/**
 * PATCH обслуживает два разных сценария по форме тела запроса:
 *  - { status } (ровно одно поле) — подтверждение/отклонение заявки сотрудника, как и раньше;
 *  - любой набор полей расхода (type/amount/method/note/employeeName) — полное редактирование
 *    уже существующего расхода, независимо от текущего способа оплаты И статуса (раньше
 *    редактирования не было вовсе, только подтверждение/отклонение).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const isStatusChange = !!body && typeof body.status === "string" && Object.keys(body).length === 1;

  await connectDB();
  const expense = await Expense.findById(params.id);
  if (!expense) return jsonError("Расход не найден", 404);

  if (isStatusChange) {
    // Подтверждение/отклонение заявки сотрудника — только владелец (не доверенное лицо):
    // пользователь явно попросил "владелец должен сам одобрить". До подтверждения расход не
    // учитывается в остатке (см. lib/finance.ts — считает только status: "approved").
    if (user.role !== "owner") return jsonError("Подтверждать расходы может только владелец", 403);

    const parsed = expenseStatusSchema.safeParse(body);
    if (!parsed.success) return zodErrorResponse(parsed.error);
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

  // Полное редактирование полей расхода.
  const parsed = expenseUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const data = parsed.data;

  // Если расход уже одобрен и (до или после правки) наличный — пересчитываем кассу, исключая
  // текущий вклад ЭТОЙ записи, чтобы редактирование суммы/способа не увело кассу в минус.
  const newMethod = data.method ?? expense.method;
  const willBeApprovedCash = expense.status === "approved" && newMethod === "cash";
  if (willBeApprovedCash) {
    const wasApprovedCash = expense.status === "approved" && expense.method === "cash";
    const cashBalance = await getCashBalance();
    const available = cashBalance + (wasApprovedCash ? expense.amount : 0);
    const newAmount = data.amount ?? expense.amount;
    if (newAmount > available) {
      return jsonError(`Недостаточно наличных в кассе для такой правки (доступно: ${Math.round(available)})`, 409);
    }
  }

  const before = expense.toObject();
  if (data.type !== undefined) expense.type = data.type;
  if (data.amount !== undefined) expense.amount = data.amount;
  if (data.method !== undefined) expense.method = data.method;
  if (data.note !== undefined) expense.note = data.note;
  if (data.employeeName !== undefined) expense.employeeName = data.employeeName;
  await expense.save();

  await logAudit({
    entity: "Expense",
    entityId: expense._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before, after: expense.toObject() },
  });

  return NextResponse.json({ expense });
}
