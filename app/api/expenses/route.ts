import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { expenseCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getCashBalance } from "@/lib/finance";

/** Список расходов (owner + trusted видят всё, включая pending-заявки от сотрудников). */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
  const filter = status ? { status } : {};
  const expenses = await Expense.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ expenses });
}

/**
 * Создание расхода с веб-панели — всегда владельцем (сотрудники подают заявку через
 * app/api/miniapp/expenses/route.ts) — поэтому статус сразу "approved" (см. models/Expense.ts,
 * lib/finance.ts).
 */
export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = expenseCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();

  // Расход наличными сразу становится "approved" (см. ниже), поэтому проверяем остаток
  // кассы уже здесь — иначе она уйдёт в минус в тот же момент, что и создание.
  if (parsed.data.method === "cash") {
    const cashBalance = await getCashBalance();
    if (parsed.data.amount > cashBalance) {
      return jsonError(`Недостаточно наличных в кассе (доступно: ${cashBalance})`, 400);
    }
  }

  const expense = await Expense.create({
    ...parsed.data,
    createdBy: user.identifier,
    createdByRole: "owner",
    status: "approved",
    approvedBy: user.identifier,
    approvedAt: new Date(),
  });

  await logAudit({
    entity: "Expense",
    entityId: expense._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { type: expense.type, amount: expense.amount, method: expense.method, status: expense.status },
  });

  return NextResponse.json({ expense });
}
