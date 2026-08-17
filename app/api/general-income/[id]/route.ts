import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { GeneralIncome } from "@/models/GeneralIncome";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";

/**
 * Удаление «Прихода на холодильник» (см. models/GeneralIncome.ts) — как и создание, доступно
 * только владельцу (см. app/api/general-income/route.ts). Раньше такую запись можно было
 * поправить только напрямую в БД — кнопка "Удалить" на странице "Оплаты" (таблица "Последние
 * платежи", строки с source: "general") теперь бьёт сюда.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);
  if (user.role !== "owner") return jsonError("Доступно только владельцу", 403);

  await connectDB();
  const entry = await GeneralIncome.findById(params.id);
  if (!entry) return jsonError("Приход не найден", 404);

  const snapshot = entry.toObject();
  await entry.deleteOne();

  await logAudit({
    entity: "GeneralIncome",
    entityId: entry._id,
    action: "delete",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { deleted: snapshot },
  });

  return NextResponse.json({ ok: true });
}
