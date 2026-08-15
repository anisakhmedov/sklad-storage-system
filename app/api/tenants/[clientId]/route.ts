import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Client } from "@/models/Client";
import { GoodsOwnerLink } from "@/models/GoodsOwnerLink";
import { Income } from "@/models/Income";
import { InventoryLedgerEntry } from "@/models/InventoryLedgerEntry";
import { Act } from "@/models/Act";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { goodsOwnerSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getTenantDetail } from "@/lib/tenants";
import { denormalizeOwner } from "@/lib/ownerKey";

export async function GET(_req: NextRequest, { params }: { params: { clientId: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const detail = await getTenantDetail(decodeURIComponent(params.clientId));
    if (!detail) return jsonError("Арендатор не найден", 404);

    return NextResponse.json({ detail });
  } catch (err) {
    console.error("GET /api/tenants/[clientId]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/**
 * Редактирование карточки арендатора — теперь это просто правка ОДНОГО документа Client
 * (models/Client.ts), а не массовая перезапись goodsOwner на каждой его StorageRecord, как было
 * до появления этой сущности: раньше профиль был денормализован в каждую запись, и без
 * массового апдейта правка тут же "терялась" бы за старыми данными в других записях. Теперь
 * профиль живёт в одном месте — StorageRecord.goodsOwner остаётся НЕТРОНУТЫМ (это снимок на
 * момент создания записи, нужен только для уже выданных PDF, см. models/StorageRecord.ts).
 *
 * Тип арендатора (физ./юр. лицо) менять нельзя — это меняет саму природу карточки (нужен ли
 * договор и т.п.), для этого нужно заводить нового клиента, а не редактировать существующего.
 *
 * Слияние с другой карточкой по совпадению телефона/ИНН больше не проблема (см.
 * models/Client.ts) — несколько клиентов МОГУТ законно иметь одинаковый телефон, поэтому
 * прежняя проверка-блокировка коллизии здесь больше не нужна.
 */
export async function PATCH(req: NextRequest, { params }: { params: { clientId: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const clientId = decodeURIComponent(params.clientId);
  if (!Types.ObjectId.isValid(clientId)) return jsonError("Некорректный идентификатор арендатора", 400);

  const body = await req.json().catch(() => null);
  const parsed = goodsOwnerSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const newOwner = parsed.data;

  await connectDB();
  const client = await Client.findById(clientId);
  if (!client) return jsonError("Арендатор не найден", 404);

  if (newOwner.type !== client.profile.type) {
    return jsonError("Нельзя изменить тип арендатора (физ./юр. лицо) при редактировании — только через новую запись", 400);
  }

  const before = client.toObject();
  client.profile = newOwner as any;
  await client.save();

  // Привязка к Telegram (см. models/GoodsOwnerLink.ts) ищется по телефону — обновляем её вместе
  // с профилем, чтобы бот продолжил узнавать клиента, если телефон изменился.
  if (newOwner.type === "individual" && before.profile.type === "individual" && before.profile.phone !== newOwner.phone) {
    await GoodsOwnerLink.updateMany({ phone: before.profile.phone }, { $set: { phone: newOwner.phone } });
  }

  // Обновляем денормализованное имя/наименование (ownerLabel — только для отображения без join,
  // см. models/Income.ts) во всех местах, где этот клиент упоминается по clientId, чтобы правка
  // опечатки в ФИО не оставалась "забытой" в старых платежах/актах/инвентаре.
  const { ownerLabel: newLabel } = denormalizeOwner(newOwner as any);
  await Promise.all([
    Income.updateMany({ clientId: client._id }, { $set: { ownerLabel: newLabel } }),
    InventoryLedgerEntry.updateMany({ clientId: client._id }, { $set: { ownerLabel: newLabel } }),
    Act.updateMany({ clientId: client._id }, { $set: { ownerLabel: newLabel } }),
  ]);

  await logAudit({
    entity: "Client",
    entityId: client._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { before: before.profile, after: newOwner },
  });

  const detail = await getTenantDetail(clientId);
  return NextResponse.json({ detail });
}
