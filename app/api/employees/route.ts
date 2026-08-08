import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const status = req.nextUrl.searchParams.get("status");
  const filter = status ? { status } : {};
  const employees = await Employee.find(filter).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ employees });
}
