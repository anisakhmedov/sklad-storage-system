import { Schema, model, models, Model, Types } from "mongoose";

export type WebRole = "owner" | "trusted";
export type WebAccessStatus = "active" | "revoked";

// Доступ к веб-панели. Помимо полей из ТЗ (identifier, grantedBy, role, status)
// добавлено поле passwordHash — см. README, раздел "Допущения" (аутентификация
// реализована по логину/паролю, а не по magic-link).
export interface IWebAccess {
  _id: Types.ObjectId;
  identifier: string; // username (без @) или телефон
  passwordHash: string;
  grantedBy: string; // identifier того, кто выдал доступ ("system" для bootstrap-владельца)
  role: WebRole;
  status: WebAccessStatus;
  createdAt: Date;
  mustChangePassword: boolean;
}

const WebAccessSchema = new Schema<IWebAccess>({
  identifier: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  grantedBy: { type: String, required: true },
  role: { type: String, enum: ["owner", "trusted"], required: true },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  createdAt: { type: Date, default: Date.now },
  mustChangePassword: { type: Boolean, default: true },
});

export const WebAccess: Model<IWebAccess> =
  models.WebAccess || model<IWebAccess>("WebAccess", WebAccessSchema);
