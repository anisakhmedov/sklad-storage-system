import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { Firm } from "@/models/Firm";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { containerUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = containerUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const container = await Container.findById(params.id);
  if (!container) return jsonError("Контейнер не найден", 404);

  const before = {
    name: container.name,
    description: container.description,
    cellCount: container.cellCount,
    firmId: container.firmId,
  };
  if (parsed.data.name !== undefined) container.name = parsed.data.name;
  if (parsed.data.description !== undefined) container.description = parsed.data.description;
  // Уменьшать cellCount ниже уже занятых/отмеченных "заполненными" камер не запрещаем на
  // уровне API — это решение владельца (сотрудник физически видит, что там лежит товар);
  // такие камеры просто перестанут отображаться в сетке (см. lib/containerCells.ts), но
  // связанные StorageRecord/Income с этим cellNumber в БД не удаляются.
  if (parsed.data.cellCount !== undefined) container.cellCount = parsed.data.cellCount;
  // Привязка фирмы по умолчанию для контейнера (см. models/Container.ts::firmId,
  // app/dashboard/firms/page.tsx) — null явно отвязывает, отсутствие поля не меняет.
  if (parsed.data.firmId !== undefined) {
    if (parsed.data.firmId === null) {
      container.firmId = undefined;
    } else {
      const firm = await Firm.findById(parsed.data.firmId);
      if (!firm) return jsonError("Фирма не найдена", 404);
      container.firmId = firm._id;
    }
  }
  await container.save();

  await logAudit({
    entity: "Container",
    entityId: container._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: {
      before,
      after: { name: container.name, description: container.description, cellCount: container.cellCount, firmId: container.firmId },
    },
  });

  return NextResponse.json({ container });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const container = await Container.findById(params.id);
  if (!container) return jsonError("Контейнер не найден", 404);

  const recordsCount = await StorageRecord.countDocuments({ containerId: container._id });
  if (recordsCount > 0) {
    return jsonError(
      "Нельзя удалить контейнер, по которому есть записи. Сначала удалите/перенесите записи.",
      400
    );
  }

  await container.deleteOne();

  await logAudit({
    entity: "Container",
    entityId: container._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { name: container.name },
  });

  return NextResponse.json({ ok: true });
}
