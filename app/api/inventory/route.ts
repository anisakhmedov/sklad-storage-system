import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { InventoryItem } from "@/models/InventoryItem";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryItemCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/** Складской инвентарь (поддоны/ящики/рохля/кара) — строго владелец, см. models/InventoryItem.ts. */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const items = await InventoryItem.find().sort({ name: 1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = inventoryItemCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const item = await InventoryItem.create({ ...parsed.data, updatedBy: user.identifier });

  await logAudit({
    entity: "InventoryItem",
    entityId: item._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: item.name, quantity: item.quantity },
  });

  return NextResponse.json({ item });
}
