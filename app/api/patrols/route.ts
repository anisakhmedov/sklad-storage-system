import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PatrolLog } from "@/models/PatrolLog";
// Побочный эффект: регистрирует схемы "Container"/"Employee" до populate() ниже (см.
// пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";

/** История обходов — owner + trusted, страница /dashboard/patrols. */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));

  const [logs, total] = await Promise.all([
    PatrolLog.find()
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("containerId", "name")
      .populate("employeeId", "name")
      .lean(),
    PatrolLog.countDocuments(),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
