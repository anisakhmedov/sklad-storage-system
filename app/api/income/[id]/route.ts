import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Income } from "@/models/Income";
import { Container } from "@/models/Container";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { incomeUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

/**
 * Полное редактирование/удаление уже внесённого платежа (веб-панель) — раньше платёж можно
 * было только создать, поменять было нельзя вовсе. Доступно независимо от способа оплаты (см.
 * lib/validation.ts::incomeUpdateSchema) — владелец/доверенное лицо может исправить сумму,
 * способ, дату, контейнер/камеру или примечание задним числом (напр. опечатка при вводе).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = incomeUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const income = await Income.findById(params.id);
  if (!income) return jsonError("Платёж не найден", 404);

  const data = parsed.data;
  if (data.containerId !== undefined) {
    const container = await Container.findById(data.containerId);
    if (!container) return jsonError("Контейнер не найден", 404);
    income.containerId = data.containerId as any;
  }
  const before = income.toObject();

  if (data.ownerLabel !== undefined) income.ownerLabel = data.ownerLabel;
  if (data.cellNumber !== undefined) income.cellNumber = data.cellNumber === null ? undefined : data.cellNumber;
  if (data.amount !== undefined) income.amount = data.amount;
  if (data.method !== undefined) income.method = data.method;
  if (data.paidAt !== undefined) income.paidAt = data.paidAt;
  if (data.note !== undefined) income.note = data.note;

  await income.save();

  await logAudit({
    entity: "Income",
    entityId: income._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before, after: income.toObject() },
  });

  return NextResponse.json({ income });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const income = await Income.findById(params.id);
  if (!income) return jsonError("Платёж не найден", 404);

  const snapshot = income.toObject();
  await income.deleteOne();

  await logAudit({
    entity: "Income",
    entityId: income._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
