import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { WebAccess } from "@/models/WebAccess";
import { loginSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { signSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const identifier = parsed.data.identifier.trim().toLowerCase();
  const user = await WebAccess.findOne({ identifier, status: "active" });
  if (!user) return jsonError("Неверный логин или пароль", 401);

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return jsonError("Неверный логин или пароль", 401);

  const token = signSession({ identifier: user.identifier, role: user.role });
  const res = NextResponse.json({
    identifier: user.identifier,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
