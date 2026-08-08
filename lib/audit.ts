import { AuditLog, ActorRole, AuditAction } from "@/models/AuditLog";
import { Types } from "mongoose";

export async function logAudit(params: {
  entity: string;
  entityId: Types.ObjectId | string;
  action: AuditAction;
  actorId: string;
  actorRole: ActorRole;
  changes?: Record<string, unknown>;
}) {
  await AuditLog.create({
    entity: params.entity,
    entityId: params.entityId,
    action: params.action,
    actorId: params.actorId,
    actorRole: params.actorRole,
    changes: params.changes,
    timestamp: new Date(),
  });
}
