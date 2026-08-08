import { NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";

export async function GET() {
  const user = await requireWebUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      identifier: user.identifier,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
}
