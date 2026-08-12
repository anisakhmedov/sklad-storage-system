import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { InventoryItem } from "@/models/InventoryItem";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryItemUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = inventoryItemUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const item = await InventoryItem.findById(params.id);
  if (!item) return jsonError("Позиция не найдена", 404);

  const before = item.toObject();
  const data = parsed.data;
  if (data.name !== undefined) item.name = data.name;
  if (data.quantity !== undefined) item.quantity = data.quantity;
  if (data.unit !== undefined) item.unit = data.unit;
  if (data.note !== undefined) item.note = data.note;
  item.updatedBy = user.identifier;
  await item.save();

  await logAudit({
    entity: "InventoryItem",
    entityId: item._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before, after: item.toObject() },
  });

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const item = await InventoryItem.findById(params.id);
  if (!item) return jsonError("Позиция не найдена", 404);

  const snapshot = item.toObject();
  await item.deleteOne();

  await logAudit({
    entity: "InventoryItem",
    entityId: item._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
