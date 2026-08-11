import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import { getAllTenants } from "@/lib/tenants";

export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const tenants = await getAllTenants();
  return NextResponse.json({ tenants });
}
