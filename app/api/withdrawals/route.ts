import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Withdrawal } from "@/models/Withdrawal";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { withdrawalCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const containerId = req.nextUrl.searchParams.get("containerId");
  const filter = containerId ? { containerId } : {};
  const withdrawals = await Withdrawal.find(filter)
    .sort({ createdAt: -1 })
    .populate("containerId", "name")
    .lean();
  return NextResponse.json({ withdrawals });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = withdrawalCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const withdrawal = await Withdrawal.create({
    containerId: parsed.data.containerId,
    productName: parsed.data.productName,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    note: parsed.data.note,
    createdBy: user.identifier,
  });

  await logAudit({
    entity: "Withdrawal",
    entityId: withdrawal._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: {
      containerId: parsed.data.containerId,
      productName: parsed.data.productName,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
    },
  });

  return NextResponse.json({ withdrawal });
}
