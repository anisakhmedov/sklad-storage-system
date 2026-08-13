import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Firm } from "@/models/Firm";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { firmCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/** Свои фирмы владельца склада (от чьего имени составляется договор/акт) — только владелец. */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const firms = await Firm.find().sort({ name: 1 }).lean();
  return NextResponse.json({ firms });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = firmCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const firm = await Firm.create({ ...parsed.data, createdBy: user.identifier });

  await logAudit({
    entity: "Firm",
    entityId: firm._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: firm.name },
  });

  return NextResponse.json({ firm });
}
