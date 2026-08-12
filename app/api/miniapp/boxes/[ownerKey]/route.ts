import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { BoxLedgerEntry } from "@/models/BoxLedgerEntry";
import { Container } from "@/models/Container";
import { resolveEmployee, employeeCanAccessContainer, allowedContainerIds } from "@/lib/miniAuth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { boxEntryCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getBoxBalanceForOwner } from "@/lib/boxes";
import { createAndSaveAct } from "@/lib/contract/actPersistence";
import { sendActToEmployee } from "@/lib/telegramNotify";

/** Баланс ящиков клиента (сколько должен) — в разделе «Клиенты» Mini App. */
export async function GET(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const ownerKey = decodeURIComponent(params.ownerKey);
    const allowed = allowedContainerIds(employee);
    const balances = (await getBoxBalanceForOwner(ownerKey)).filter(
      (b) => !allowed || allowed.includes(b.containerId)
    );
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("GET /api/miniapp/boxes/[ownerKey]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/** Выдать/принять ящики — фиксирует операцию в BoxLedgerEntry (см. models/BoxLedgerEntry.ts). */
export async function POST(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = boxEntryCreateSchema.safeParse({ ...body, ownerKey: decodeURIComponent(params.ownerKey) });
    if (!parsed.success) return zodErrorResponse(parsed.error);

    if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
      return jsonError("Нет доступа к этому контейнеру", 403);
    }

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
      createdBy: employee.name,
      createdByRole: "employee",
    });

    await logAudit({
      entity: "BoxLedgerEntry",
      entityId: entry._id,
      action: "create",
      actorId: String(employee._id),
      actorRole: "employee",
      changes: {
        ownerKey: entry.ownerKey,
        containerId: String(entry.containerId),
        direction: entry.direction,
        quantity: entry.quantity,
        ratePerBox: entry.ratePerBox,
      },
    });

    // Раньше выдача/приём ящиков не сопровождались актом вообще — теперь, как и для товара
    // и инвентаря, акт сохраняется целиком и уходит сотруднику в Telegram (best-effort).
    const act = await createAndSaveAct({
      kind: entry.direction === "given" ? "box_given" : "box_returned",
      ownerKey: entry.ownerKey,
      ownerLabel: entry.ownerLabel,
      ownerType: entry.ownerType,
      containerId: String(entry.containerId),
      containerName: container.name,
      itemLabel: "Ящики",
      changedQuantityText: `${entry.quantity} шт.`,
      createdBy: employee.name,
      createdByRole: "employee",
    });
    entry.actId = act._id;
    await entry.save();
    await sendActToEmployee(employee.telegramId, act);

    return NextResponse.json({ entry: { id: String(entry._id) } });
  } catch (err) {
    console.error("POST /api/miniapp/boxes/[ownerKey]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
