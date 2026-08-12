import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TransportContainer } from "@/models/TransportContainer";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { transportContainerCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/** Контейнеры для перевозки (временные, без камер/актов) — см. models/TransportContainer.ts. */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const containers = await TransportContainer.find().sort({ label: 1 }).lean();
  return NextResponse.json({ containers });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = transportContainerCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const existing = await TransportContainer.findOne({ label: parsed.data.label });
  if (existing) return jsonError("Контейнер с таким номером уже есть", 409);

  const container = await TransportContainer.create({ ...parsed.data, createdBy: user.identifier });

  await logAudit({
    entity: "TransportContainer",
    entityId: container._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { label: container.label },
  });

  return NextResponse.json({ container });
}
