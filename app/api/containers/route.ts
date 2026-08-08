import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { containerCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const containers = await Container.find().sort({ name: 1 }).lean();
  return NextResponse.json({ containers });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = containerCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const existing = await Container.findOne({ name: parsed.data.name });
  if (existing) return jsonError("Контейнер с таким названием уже существует", 409);

  const container = await Container.create({
    name: parsed.data.name,
    description: parsed.data.description,
    createdBy: user.identifier,
  });

  await logAudit({
    entity: "Container",
    entityId: container._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: container.name, description: container.description },
  });

  return NextResponse.json({ container });
}
