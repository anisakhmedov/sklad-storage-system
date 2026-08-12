import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { toggleCellFull } from "@/lib/containerCells";
import { cellFullToggleSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";

/** Ручная отметка "камера заполнена / свободна" с веб-панели (владелец/доверенное лицо). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = cellFullToggleSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(params.id).select("_id").lean();
  if (!container) return jsonError("Контейнер не найден", 404);

  await toggleCellFull(params.id, parsed.data.cellNumber, parsed.data.full);

  await logAudit({
    entity: "Container",
    entityId: params.id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { cellNumber: parsed.data.cellNumber, full: parsed.data.full },
  });

  return NextResponse.json({ ok: true });
}
