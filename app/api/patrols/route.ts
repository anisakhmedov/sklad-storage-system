import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PatrolLog } from "@/models/PatrolLog";
// Побочный эффект: регистрирует схемы "Container"/"Employee" до populate() ниже (см.
// пояснение в lib/contract/contractService.ts).
import "@/models/Container";
import "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";

/** История обходов — owner + trusted, страница /dashboard/patrols, с фильтрами. */
export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") || 1));
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit") || 50)));

  const filter: Record<string, unknown> = {};
  const containerId = sp.get("containerId");
  if (containerId) filter.containerId = containerId;
  const cellNumber = sp.get("cellNumber");
  if (cellNumber) filter.cellNumber = Number(cellNumber);
  const period = sp.get("period");
  if (period) filter.period = period;
  const from = sp.get("from");
  const to = sp.get("to");
  if (from || to) {
    filter.date = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    PatrolLog.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("containerId", "name")
      .populate("employeeId", "name")
      .lean(),
    PatrolLog.countDocuments(filter),
  ]);

  return NextResponse.json({ logs, total, page, limit });
}
