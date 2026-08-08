import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodErrorResponse(err: ZodError) {
  const message = err.issues.map((i) => i.message).join("; ");
  return jsonError(message, 400);
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
