import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { WebAccess } from "@/models/WebAccess";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";

const schema = z.object({ status: z.enum(["active", "revoked"]) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const target = await WebAccess.findById(params.id);
  if (!target) return jsonError("Запись не найдена", 404);

  if (target.identifier === user.identifier) {
    return jsonError("Нельзя изменить статус собственной учётной записи", 400);
  }

  const before = target.status;
  target.status = parsed.data.status;
  await target.save();

  await logAudit({
    entity: "WebAccess",
    entityId: target._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { status: { before, after: target.status } },
  });

  return NextResponse.json({ ok: true });
}
