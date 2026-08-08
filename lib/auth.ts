import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { connectDB } from "./db";
import { WebAccess, WebRole } from "@/models/WebAccess";

const SECRET = process.env.NEXTAUTH_SECRET || "dev-insecure-secret-change-me";
export const SESSION_COOKIE = "sklad_session";

export interface SessionPayload {
  identifier: string;
  role: WebRole;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

/** Читает и проверяет сессию из cookies() серверного компонента/route-хендлера. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Проверяет сессию и что аккаунт всё ещё активен в БД. Возвращает запись WebAccess. */
export async function requireWebUser() {
  const session = await getSession();
  if (!session) return null;
  await connectDB();
  const user = await WebAccess.findOne({
    identifier: session.identifier,
    status: "active",
  }).lean();
  if (!user) return null;
  return user;
}
