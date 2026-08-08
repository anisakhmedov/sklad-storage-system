import { Schema, model, models, Model, Types } from "mongoose";

export interface IContainer {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: string; // identifier (username/phone) веб-пользователя
  createdAt: Date;
  updatedAt: Date;
}

const ContainerSchema = new Schema<IContainer>({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ContainerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Container: Model<IContainer> =
  models.Container || model<IContainer>("Container", ContainerSchema);
