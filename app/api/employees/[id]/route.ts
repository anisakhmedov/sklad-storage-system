import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { requireWebUser } from "@/lib/auth";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { employeeStatusSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const body = await req.json().catch(() => null);
  const parsed = employeeStatusSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  await connectDB();
  const employee = await Employee.findById(params.id);
  if (!employee) return jsonError("Сотрудник не найден", 404);

  const before = employee.status;
  employee.status = parsed.data.status;
  await employee.save();

  await logAudit({
    entity: "Employee",
    entityId: employee._id,
    action: "update",
    actorId: user.identifier,
    actorRole: user.role,
    changes: { status: { before, after: employee.status } },
  });

  return NextResponse.json({ employee });
}
