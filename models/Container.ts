import { Schema, model, models, Model, Types } from "mongoose";
import { DEFAULT_CELL_COUNT, MAX_CELL_COUNT } from "@/lib/cells";

export interface IContainer {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: string; // identifier (username/phone) веб-пользователя
  /**
   * Количество камер хранения в ЭТОМ конкретном контейнере — раньше было единой константой
   * (8) на все контейнеры без исключений, теперь редактируется индивидуально на веб-панели
   * (см. app/dashboard/containers/page.tsx, app/api/containers/[id]/route.ts). По умолчанию —
   * DEFAULT_CELL_COUNT (см. lib/cells.ts); у контейнеров, созданных до этой доработки, поле в
   * БД отсутствует — везде, где оно читается, применяется тот же запасной вариант.
   */
  cellCount: number;
  /**
   * Номера камер хранения (1–cellCount, см. выше) внутри этого контейнера,
   * вручную отмеченные сотрудником/владельцем как «заполнена» — в них нельзя разместить
   * новый груз (см. app/api/miniapp/records/route.ts). Это НЕ автоматический подсчёт
   * арендаторов камеры, а ручной флажок: сколько бы людей физически ни было в камере,
   * статус «заполнена» ставит и снимает человек через
   * app/api/miniapp/containers/[id]/cells/route.ts или app/api/containers/[id]/cells/route.ts.
   */
  fullCells: number[];
  /**
   * Фирма (models/Firm.ts), от чьего имени по умолчанию оформляются договоры/акты для записей
   * в ЭТОМ контейнере — задаётся на веб-панели (см. app/dashboard/firms/page.tsx). Когда
   * привязана, сотрудник в Mini App больше не выбирает фирму вручную при создании записи (шаг
   * "firm" в мастере пропускается, см. components/miniapp/NewRecordWizard.tsx) — она
   * подставляется автоматически по выбранному контейнеру. undefined — контейнер ни к какой
   * фирме не привязан, действует прежнее поведение (шаг показывается, если фирм ≥2).
   */
  firmId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContainerSchema = new Schema<IContainer>({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  createdBy: { type: String, required: true },
  cellCount: { type: Number, default: DEFAULT_CELL_COUNT, min: 1, max: MAX_CELL_COUNT },
  fullCells: { type: [Number], default: [] },
  firmId: { type: Schema.Types.ObjectId, ref: "Firm" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ContainerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export const Container: Model<IContainer> =
  models.Container || model<IContainer>("Container", ContainerSchema);
