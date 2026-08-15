import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Income } from "@/models/Income";
import { GeneralIncome } from "@/models/GeneralIncome";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { incomeCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { Client } from "@/models/Client";
import { denormalizeOwner } from "@/lib/ownerKey";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const clientId = sp.get("clientId");
  const containerId = sp.get("containerId");
  if (clientId) filter.clientId = clientId;
  if (containerId) filter.containerId = containerId;

  const incomes = await Income.find(filter)
    .sort({ paidAt: -1 })
    .populate("containerId", "name")
    .limit(200)
    .lean();

  // «Приход на холодильник» (GeneralIncome, см. models/GeneralIncome.ts) не привязан к
  // арендатору/контейнеру — подмешиваем в общий список платежей только когда запрашивается
  // весь список без фильтра по конкретному арендатору/контейнеру (страница "Оплаты"), иначе
  // список платежей конкретного арендатора не должен "видеть" чужие внешние приходы.
  if (clientId || containerId) {
    return NextResponse.json({ incomes: incomes.map((e) => ({ ...e, source: "tenant" as const })) });
  }

  const generalEntries = await GeneralIncome.find().sort({ paidAt: -1 }).limit(200).lean();
  const tagged = [
    ...incomes.map((e) => ({ ...e, source: "tenant" as const })),
    ...generalEntries.map((e) => ({
      ...e,
      ownerType: "company" as const,
      clientId: null,
      ownerLabel: "Внешний приход (холодильник)",
      containerId: null,
      cellNumber: undefined,
      source: "general" as const,
    })),
  ].sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

  return NextResponse.json({ incomes: tagged.slice(0, 200) });
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

  const client = await Client.findById(parsed.data.clientId).lean();
  if (!client) return jsonError("Клиент не найден", 404);

  // Камера обязательна (см. lib/validation.ts::incomeCreateSchema) и должна совпадать с одной
  // из камер, где у этого клиента реально есть запись в этом контейнере — защита от опечаток
  // и от оплаты за камеру, которую клиент не занимает (раньше проверялась только связка
  // владелец+контейнер, без камеры — задолженность иначе никогда не найдёт этот платёж).
  const hasRecordInCell = await StorageRecord.exists({
    clientId: parsed.data.clientId,
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
  });
  if (!hasRecordInCell) {
    return jsonError("У этого клиента нет записей в выбранной камере этого контейнера", 404);
  }

  const income = await Income.create({
    clientId: client._id,
    ...denormalizeOwner(client.profile),
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
      clientId: String(income.clientId),
      ownerLabel: income.ownerLabel,
      containerId: String(income.containerId),
      amount: income.amount,
      method: income.method,
      paidAt: income.paidAt,
    },
  });

  return NextResponse.json({ income });
}
