import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
// Модели ниже нигде в этом файле напрямую не используются, но нужны, чтобы
// mongoose зарегистрировал их схемы для .populate() — на Vercel каждый API-роут
// собирается в отдельную serverless-функцию по фактическим импортам, и без
// прямого импорта здесь populate() падает с MissingSchemaError в проде
// (хотя в `next dev` ошибка не проявляется, т.к. там общий процесс).
import "@/models/Container";
import "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { Types } from "mongoose";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;

  const filter: Record<string, unknown> = {};
  const containerId = sp.get("containerId");
  const product = sp.get("product");
  const employeeId = sp.get("employeeId");
  const paymentMethod = sp.get("paymentMethod");
  const from = sp.get("from");
  const to = sp.get("to");

  if (containerId && Types.ObjectId.isValid(containerId)) filter.containerId = containerId;
  if (employeeId && Types.ObjectId.isValid(employeeId)) filter.createdByEmployeeId = employeeId;
  if (paymentMethod) filter["payment.method"] = paymentMethod;
  if (product) filter.productName = { $regex: product, $options: "i" };
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.$gte = new Date(from);
    if (to) createdAt.$lte = new Date(to);
    filter.createdAt = createdAt;
  }

  const page = Math.max(1, Number(sp.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));

  const [records, total] = await Promise.all([
    StorageRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("containerId", "name")
      .populate("createdByEmployeeId", "name phone")
      .lean(),
    StorageRecord.countDocuments(filter),
  ]);

  return NextResponse.json({ records, total, page, limit });
}
