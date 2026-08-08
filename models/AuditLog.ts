import { Schema, model, models, Model, Types } from "mongoose";

export type AuditAction = "create" | "update" | "delete";
export type ActorRole = "owner" | "trusted" | "employee" | "system";

export interface IAuditLog {
  _id: Types.ObjectId;
  entity: string; // напр. "StorageRecord", "Container"
  entityId: Types.ObjectId;
  action: AuditAction;
  actorId: string; // identifier веб-пользователя или telegramId сотрудника
  actorRole: ActorRole;
  changes?: Record<string, unknown>;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  entity: { type: String, required: true, index: true },
  entityId: { type: Schema.Types.ObjectId, required: true, index: true },
  action: { type: String, enum: ["create", "update", "delete"], required: true },
  actorId: { type: String, required: true },
  actorRole: { type: String, enum: ["owner", "trusted", "employee", "system"], required: true },
  changes: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true },
});

export const AuditLog: Model<IAuditLog> =
  models.AuditLog || model<IAuditLog>("AuditLog", AuditLogSchema);
