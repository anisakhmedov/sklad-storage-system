import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { Types } from "mongoose";

/**
 * Полный журнал действий на сайте (п.7 доработок) — доступен и owner, и trusted (см. план).
 * AuditLog уже пишется большинством роутов (см. lib/audit.ts) — здесь только чтение с
 * фильтрами и пагинацией, по образцу GET /api/records.
 */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;

  const filter: Record<string, unknown> = {};
  const entity = sp.get("entity");
  const action = sp.get("action");
  const actorId = sp.get("actorId");
  const from = sp.get("from");
  const to = sp.get("to");

  if (entity) filter.entity = entity;
  if (action) filter.action = action;
  if (actorId) filter.actorId = actorId;
  if (from || to) {
    const timestamp: Record<string, Date> = {};
    if (from) timestamp.$gte = new Date(from);
    if (to) timestamp.$lte = new Date(to);
    filter.timestamp = timestamp;
  }

  const page = Math.max(1, Number(sp.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  // Для actorRole "employee" actorId — это Employee._id (не читаемое имя), для остальных
  // ролей actorId уже сам по себе читаемый идентификатор веб-пользователя (см. lib/audit.ts).
  const employeeIds = Array.from(
    new Set(
      logs.filter((l) => l.actorRole === "employee" && Types.ObjectId.isValid(l.actorId)).map((l) => l.actorId)
    )
  );
  const employees = employeeIds.length
    ? await Employee.find({ _id: { $in: employeeIds } }).select("name").lean()
    : [];
  const employeeNameById = new Map(employees.map((e) => [String(e._id), e.name]));

  const items = logs.map((l) => ({
    ...l,
    actorLabel: l.actorRole === "employee" ? employeeNameById.get(l.actorId) || l.actorId : l.actorId,
  }));

  return NextResponse.json({ logs: items, total, page, limit });
}
