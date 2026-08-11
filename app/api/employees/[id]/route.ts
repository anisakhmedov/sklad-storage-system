import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { employeeUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = employeeUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);
  if (parsed.data.status === undefined && parsed.data.containerAccess === undefined) {
    return jsonError("Нечего обновлять", 400);
  }

  await connectDB();
  const employee = await Employee.findById(params.id);
  if (!employee) return jsonError("Сотрудник не найден", 404);

  const changes: Record<string, unknown> = {};

  if (parsed.data.status !== undefined) {
    const before = employee.status;
    employee.status = parsed.data.status;
    changes.status = { before, after: employee.status };
  }

  if (parsed.data.containerAccess !== undefined) {
    const before = employee.containerAccess.map(String);
    employee.containerAccess = parsed.data.containerAccess as any;
    changes.containerAccess = { before, after: parsed.data.containerAccess };
  }

  await employee.save();

  await logAudit({
    entity: "Employee",
    entityId: employee._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes,
  });

  return NextResponse.json({ employee });
}
