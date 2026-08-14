import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { BoxLedgerEntry } from "@/models/BoxLedgerEntry";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { boxEntryCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getAllBoxBalances } from "@/lib/boxes";
import { createAndSaveAct } from "@/lib/contract/actPersistence";

/** Список всех должников по ящикам — веб-панель, страница «Ящики» (owner + trusted). */
export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const balances = await getAllBoxBalances();
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("GET /api/boxes:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/**
 * Выдать/принять ящики с веб-панели (владелец) — раньше такой формы на вебе не было вообще,
 * только просмотр остатков (см. GET выше) и просмотр уже выданных актов (ActsModal). Тот же
 * механизм, что и в Mini App (app/api/miniapp/boxes/[ownerKey]/route.ts): фиксирует операцию в
 * BoxLedgerEntry и сразу сохраняет PDF-акт — здесь его некому отправлять в Telegram, он просто
 * доступен там же, где и остальные акты.
 */
export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  const body = await req.json().catch(() => null);
  const parsed = boxEntryCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const entry = await BoxLedgerEntry.create({
    ownerKey: parsed.data.ownerKey,
    ownerType: parsed.data.ownerType,
    ownerLabel: parsed.data.ownerLabel,
    containerId: parsed.data.containerId,
    direction: parsed.data.direction,
    quantity: parsed.data.quantity,
    ratePerBox: parsed.data.ratePerBox,
    createdBy: user.identifier,
    createdByRole: "web",
  });

  await logAudit({
    entity: "BoxLedgerEntry",
    entityId: entry._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: {
      ownerKey: entry.ownerKey,
      containerId: String(entry.containerId),
      direction: entry.direction,
      quantity: entry.quantity,
      ratePerBox: entry.ratePerBox,
    },
  });

  const act = await createAndSaveAct({
    kind: entry.direction === "given" ? "box_given" : "box_returned",
    ownerKey: entry.ownerKey,
    ownerLabel: entry.ownerLabel,
    ownerType: entry.ownerType,
    containerId: String(entry.containerId),
    containerName: container.name,
    itemLabel: "Ящики",
    changedQuantityText: `${entry.quantity} шт.`,
    createdBy: user.identifier,
    createdByRole: "owner",
  });
  entry.actId = act._id;
  await entry.save();

  return NextResponse.json({ entry: { id: String(entry._id) }, actId: String(act._id) });
}
