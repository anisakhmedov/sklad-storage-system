import { Schema, model, models, Model, Types } from "mongoose";

export interface IContainer {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: string; // identifier (username/phone) веб-пользователя
  /**
   * Номера камер хранения (1–8, см. lib/cells.ts::CELL_COUNT) внутри этого контейнера,
   * вручную отмеченные сотрудником/владельцем как «заполнена» — в них нельзя разместить
   * новый груз (см. app/api/miniapp/records/route.ts). Это НЕ автоматический подсчёт
   * арендаторов камеры, а ручной флажок: сколько бы людей физически ни было в камере,
   * статус «заполнена» ставит и снимает человек через
   * app/api/miniapp/containers/[id]/cells/route.ts или app/api/containers/[id]/cells/route.ts.
   */
  fullCells: number[];
  createdAt: Date;
  updatedAt: Date;
}

const ContainerSchema = new Schema<IContainer>({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  createdBy: { type: String, required: true },
  fullCells: { type: [Number], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ContainerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Container: Model<IContainer> =
  models.Container || model<IContainer>("Container", ContainerSchema);
