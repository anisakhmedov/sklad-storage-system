import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Expense } from "@/models/Expense";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { expenseCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getMethodBalance } from "@/lib/finance";
import { PAYMENT_METHOD_LABELS } from "@/lib/labels";

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

  // Расход сразу становится "approved" (см. ниже), поэтому проверяем остаток по способу оплаты
  // уже здесь — иначе он уйдёт в минус в тот же момент, что и создание. Проверяется КАЖДЫЙ
  // способ (наличные/перевод/карта), а не только касса — иначе через перевод или карту можно
  // было списать сколько угодно без проверки остатка (см. lib/finance.ts::getMethodBalance).
  const balance = await getMethodBalance(parsed.data.method);
  if (parsed.data.amount > balance) {
    return jsonError(
      `Недостаточно средств (${PAYMENT_METHOD_LABELS[parsed.data.method]}) — доступно: ${Math.round(balance)}`,
      400
    );
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
