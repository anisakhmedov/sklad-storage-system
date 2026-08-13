import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Income } from "@/models/Income";
import { InventoryLedgerEntry } from "@/models/InventoryLedgerEntry";
import { BoxLedgerEntry } from "@/models/BoxLedgerEntry";
import { Act } from "@/models/Act";
import { GoodsOwnerLink } from "@/models/GoodsOwnerLink";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { goodsOwnerSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { getTenantDetail } from "@/lib/tenants";
import { parseOwnerKey, ownerKeyForPhone, ownerKeyForInn, ownerLabelOf } from "@/lib/ownerKey";

export async function GET(_req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  try {
    const detail = await getTenantDetail(decodeURIComponent(params.ownerKey));
    if (!detail) return jsonError("Арендатор не найден", 404);

    return NextResponse.json({ detail });
  } catch (err) {
    console.error("GET /api/tenants/[ownerKey]:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}

/**
 * Редактирование карточки арендатора — по решению владельца (см. обсуждение), правка
 * применяется КО ВСЕМ записям (StorageRecord) этого арендатора разом, а не к одной записи:
 * профиль (ФИО/телефон/паспорт или наименование/ИНН/директор) дублирован в каждой
 * StorageRecord.goodsOwner (см. models/StorageRecord.ts), карточка на /dashboard/tenants
 * показывает "снимок" из самой свежей записи (см. lib/tenants.ts::getTenantDetail) — без
 * массового обновления правка тут же перезатёрлась бы старыми данными в других записях.
 *
 * Тип арендатора (физ./юр. лицо) менять нельзя — это меняет саму природу записи (нужен ли
 * договор и т.п.), для этого нужно заводить новую запись, а не редактировать существующую.
 *
 * Если меняется телефон (физлицо) или ИНН (юрлицо) — это меняет ownerKey (см.
 * lib/ownerKey.ts), поэтому дополнительно переносим денормализованные ownerKey/ownerLabel во
 * ВСЕХ местах, где арендатор упоминается по ключу (Income/InventoryLedgerEntry/BoxLedgerEntry/
 * Act), и обновляем привязку к Telegram (GoodsOwnerLink), чтобы бот продолжил узнавать клиента
 * по новому номеру.
 */
export async function PATCH(req: NextRequest, { params }: { params: { ownerKey: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const ownerKey = decodeURIComponent(params.ownerKey);
  const parsedKey = parseOwnerKey(ownerKey);
  if (!parsedKey) return jsonError("Некорректный идентификатор арендатора", 400);

  const body = await req.json().catch(() => null);
  const parsed = goodsOwnerSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  const newOwner = parsed.data;

  if (newOwner.type !== parsedKey.type) {
    return jsonError("Нельзя изменить тип арендатора (физ./юр. лицо) при редактировании — только через новую запись", 400);
  }

  await connectDB();

  const recordFilter =
    parsedKey.type === "individual"
      ? { "goodsOwner.type": "individual" as const, "goodsOwner.phone": parsedKey.value }
      : { "goodsOwner.type": "company" as const, "goodsOwner.inn": parsedKey.value };

  const records = await StorageRecord.find(recordFilter);
  if (records.length === 0) return jsonError("Арендатор не найден", 404);

  const newOwnerKey =
    newOwner.type === "individual" ? ownerKeyForPhone(newOwner.phone) : ownerKeyForInn(newOwner.inn);
  const newLabel = ownerLabelOf(newOwner as any);
  const keyChanged = newOwnerKey !== ownerKey;

  if (keyChanged) {
    // Не даём случайно "слить" карточку с уже существующим другим арендатором — если под новым
    // ключом уже есть записи, это чужая карточка, а не опечатка в этой.
    const collision = await getTenantDetail(newOwnerKey);
    if (collision) {
      return jsonError("У другого арендатора уже есть такой телефон/ИНН — слияние карточек не поддерживается", 409);
    }
  }

  // Правим каждую запись по отдельности (не updateMany) — чтобы сохранить существующий журнал
  // изменений (editedBy/editedAt + AuditLog по каждой StorageRecord, см. app/dashboard/records/page.tsx
  // → кнопка "История"), как и при редактировании одной записи (app/api/records/[id]/route.ts).
  for (const record of records) {
    const before = record.toObject();
    record.goodsOwner = newOwner as any;
    record.editedBy = user.identifier;
    record.editedAt = new Date();
    await record.save();
    await logAudit({
      entity: "StorageRecord",
      entityId: record._id,
      action: "update",
      actorId: user.identifier,
      actorRole: user.role,
      changes: { before, after: record.toObject() },
    });
  }

  // Переносим денормализованные ownerKey/ownerLabel везде, где арендатор упоминается по ключу
  // (см. комментарий над функцией) — даже если ключ не менялся, ownerLabel мог устареть
  // (напр. исправили опечатку в ФИО), поэтому обновляем оба поля всегда.
  await Promise.all([
    Income.updateMany({ ownerKey }, { $set: { ownerKey: newOwnerKey, ownerLabel: newLabel } }),
    InventoryLedgerEntry.updateMany({ ownerKey }, { $set: { ownerKey: newOwnerKey, ownerLabel: newLabel } }),
    BoxLedgerEntry.updateMany({ ownerKey }, { $set: { ownerKey: newOwnerKey, ownerLabel: newLabel } }),
    Act.updateMany({ ownerKey }, { $set: { ownerKey: newOwnerKey, ownerLabel: newLabel } }),
    parsedKey.type === "individual"
      ? GoodsOwnerLink.updateMany(
          { phone: parsedKey.value },
          { $set: { phone: (newOwner as { phone: string }).phone, fullName: newLabel } }
        )
      : Promise.resolve(),
  ]);

  await logAudit({
    entity: "Tenant",
    entityId: new Types.ObjectId(),
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { ownerKey, newOwnerKey: keyChanged ? newOwnerKey : undefined, recordsUpdated: records.length, profile: newOwner },
  });

  const detail = await getTenantDetail(newOwnerKey);
  return NextResponse.json({ detail, newOwnerKey: keyChanged ? newOwnerKey : undefined });
}
