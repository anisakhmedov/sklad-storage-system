import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { WebAccess } from "@/models/WebAccess";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { webAccessCreateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  await connectDB();
  const list = await WebAccess.find().sort({ createdAt: -1 }).select("-passwordHash").lean();
  return NextResponse.json({ access: list });
}

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString("base64url");
}

export async function POST(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = webAccessCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const identifier = parsed.data.identifier.trim().toLowerCase().replace(/^@/, "");
  const existing = await WebAccess.findOne({ identifier });
  if (existing) return jsonError("Такой идентификатор уже имеет доступ", 409);

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const created = await WebAccess.create({
    identifier,
    passwordHash,
    grantedBy: user.identifier,
    role: parsed.data.role,
    status: "active",
    mustChangePassword: true,
  });

  await logAudit({
    entity: "WebAccess",
    entityId: created._id,
    action: "create",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { identifier, role: parsed.data.role },
  });

  // Временный пароль отдаём один раз в ответе — сохранить его нужно вручную
  // и передать новому пользователю (SMS/устно/в Telegram).
  return NextResponse.json({
    access: { identifier, role: created.role, status: created.status },
    tempPassword,
  });
}
