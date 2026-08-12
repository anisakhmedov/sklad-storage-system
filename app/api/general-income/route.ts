import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { GeneralIncome } from "@/models/GeneralIncome";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { generalIncomeCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * «Приход на холодильник» — общий приход не по конкретному арендатору (см. models/GeneralIncome.ts).
 * Только владелец, только с сайта.
 */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const entries = await GeneralIncome.find().sort({ paidAt: -1 }).limit(200).lean();
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = generalIncomeCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const entry = await GeneralIncome.create({
    amount: parsed.data.amount,
    method: parsed.data.method,
    note: parsed.data.note,
    paidAt: parsed.data.paidAt || new Date(),
    recordedBy: user.identifier,
  });

  await logAudit({
    entity: "GeneralIncome",
    entityId: entry._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { amount: entry.amount, method: entry.method },
  });

  return NextResponse.json({ entry });
}
