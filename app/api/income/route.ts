import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Income } from "@/models/Income";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { incomeCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { parseOwnerKey } from "@/lib/ownerKey";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const ownerKey = sp.get("ownerKey");
  const containerId = sp.get("containerId");
  if (ownerKey) filter.ownerKey = ownerKey;
  if (containerId) filter.containerId = containerId;

  const incomes = await Income.find(filter)
    .sort({ paidAt: -1 })
    .populate("containerId", "name")
    .limit(200)
    .lean();
  return NextResponse.json({ incomes });
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = incomeCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();

  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  const ownerKeyParsed = parseOwnerKey(parsed.data.ownerKey);
  if (!ownerKeyParsed || ownerKeyParsed.type !== parsed.data.ownerType) {
    return jsonError("Некорректный идентификатор владельца груза", 400);
  }

  // Защита от опечаток/произвольного ownerKey: платёж можно завести только на связку
  // владелец+контейнер, для которой реально существует хотя бы одна StorageRecord —
  // иначе задолженность (lib/debt.ts) никогда не найдёт этот платёж и он "потеряется".
  const ownerRecordFilter =
    ownerKeyParsed.type === "individual"
      ? { "goodsOwner.type": "individual", "goodsOwner.phone": ownerKeyParsed.value }
      : { "goodsOwner.type": "company", "goodsOwner.inn": ownerKeyParsed.value };
  const hasRecord = await StorageRecord.exists({
    ...ownerRecordFilter,
    containerId: parsed.data.containerId,
  });
  if (!hasRecord) {
    return jsonError("Не найдено ни одной записи с таким владельцем в этом контейнере", 404);
  }

  const income = await Income.create({
    ownerType: parsed.data.ownerType,
    ownerKey: parsed.data.ownerKey,
    ownerLabel: parsed.data.ownerLabel,
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
    amount: parsed.data.amount,
    method: parsed.data.method,
    paidAt: parsed.data.paidAt || new Date(),
    note: parsed.data.note,
    recordedBy: user.identifier,
  });

  await logAudit({
    entity: "Income",
    entityId: income._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: {
      ownerKey: income.ownerKey,
      ownerLabel: income.ownerLabel,
      containerId: String(income.containerId),
      amount: income.amount,
      method: income.method,
      paidAt: income.paidAt,
    },
  });

  return NextResponse.json({ income });
}
