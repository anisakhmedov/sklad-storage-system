import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { inventoryDisposalCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { createInventoryDisposal, getInventoryDisposals, InventoryDisposalError } from "@/lib/inventoryDisposal";

/**
 * Продажа/списание инвентаря — веб-панель (владелец и доверенное лицо, как и большинство
 * финансово-складских разделов; см. models/InventoryDisposalEntry.ts). Заменяет собой прежний
 * раздел "Контейнеры для перевозки".
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const sp = req.nextUrl.searchParams;
  const entries = await getInventoryDisposals({
    containerId: sp.get("containerId") || undefined,
    kind: (sp.get("kind") as "sale" | "writeoff" | null) || undefined,
  });
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = inventoryDisposalCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  try {
    const entry = await createInventoryDisposal({
      ...parsed.data,
      createdBy: user.identifier,
      createdByRole: user.role,
    });

    await logAudit({
      entity: "InventoryDisposalEntry",
      entityId: entry._id,
      action: "create",
      actorId: user.identifier,
      actorRole: user.role,
      changes: {
        itemId: String(entry.itemId),
        containerId: String(entry.containerId),
        kind: entry.kind,
        quantity: entry.quantity,
        amount: entry.amount,
      },
    });

    return NextResponse.json({ entry: { id: String(entry._id) } });
  } catch (err) {
    if (err instanceof InventoryDisposalError) return jsonError(err.message, 400);
    console.error("POST /api/inventory/disposals:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
