import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { AuditLog } from "@/models/AuditLog";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const logs = await AuditLog.find({ entity: "StorageRecord", entityId: params.id })
    .sort({ timestamp: -1 })
    .lean();

  return NextResponse.json({ logs });
}
