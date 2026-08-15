import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Act } from "@/models/Act";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { Types } from "mongoose";

/**
 * Список актов для кнопки "Акты" на странице "Записи" (app/dashboard/records/page.tsx) —
 * объединяет акты, привязанные к конкретной записи (recordId, только goods_*), и акты по
 * этому же клиенту+контейнеру (инвентарь, у которого нет своей StorageRecord). Хотя бы
 * один из параметров обязателен, чтобы не отдавать весь список актов по всей системе.
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const recordId = req.nextUrl.searchParams.get("recordId");
  const ownerKey = req.nextUrl.searchParams.get("ownerKey");
  const containerId = req.nextUrl.searchParams.get("containerId");

  const or: Record<string, unknown>[] = [];
  if (recordId && Types.ObjectId.isValid(recordId)) or.push({ recordId });
  if (ownerKey && containerId) or.push({ ownerKey, containerId });
  if (or.length === 0) return jsonError("Укажите recordId или ownerKey+containerId", 400);

  await connectDB();
  const acts = await Act.find({ $or: or })
    .select("-pdfBuffer")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ acts });
}
