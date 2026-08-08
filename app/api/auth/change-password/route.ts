import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { WebAccess } from "@/models/WebAccess";
import { getSession } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";

const schema = z.object({
  newPassword: z.string().min(4, "Пароль должен быть не короче 4 символов"),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await WebAccess.updateOne(
    { identifier: session.identifier },
    { $set: { passwordHash, mustChangePassword: false } }
  );

  return NextResponse.json({ ok: true });
}
