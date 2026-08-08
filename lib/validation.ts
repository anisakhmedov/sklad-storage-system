import { z } from "zod";

export const unitEnum = z.enum(["tonne", "kg", "box", "piece"]);
export const paymentMethodEnum = z.enum(["cash", "terminal", "transfer"]);
export const webRoleEnum = z.enum(["owner", "trusted"]);

export const loginSchema = z.object({
  identifier: z.string().min(3, "Слишком короткий идентификатор"),
  password: z.string().min(4, "Пароль должен быть не короче 4 символов"),
});

export const employeeRegisterSchema = z.object({
  name: z.string().min(2, "Укажите имя").max(100),
  phone: z.string().min(5, "Укажите номер телефона").max(30),
});

export const employeeStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export const containerCreateSchema = z.object({
  name: z.string().min(1, "Укажите номер/название контейнера").max(100),
  description: z.string().max(1000).optional().default(""),
});

export const containerUpdateSchema = containerCreateSchema.partial();

export const goodsOwnerSchema = z.object({
  fullName: z.string().min(2, "Укажите ФИО владельца груза").max(200),
  phone: z.string().min(5, "Укажите телефон владельца груза").max(30),
  passportData: z.string().min(3, "Укажите паспортные данные").max(100),
  pinfl: z.string().min(3, "Укажите ПИНФЛ").max(50),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().min(0, "Сумма не может быть отрицательной"),
  method: paymentMethodEnum,
});

export const storageRecordCreateSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  productName: z.string().min(1, "Укажите наименование товара").max(300),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unit: unitEnum,
  goodsOwner: goodsOwnerSchema,
  payment: paymentSchema,
});

export const storageRecordUpdateSchema = storageRecordCreateSchema.partial();

export const webAccessCreateSchema = z.object({
  identifier: z.string().min(3, "Укажите username или телефон"),
  role: webRoleEnum,
});

export const withdrawalCreateSchema = z.object({
  containerId: z.string().min(1, "Выберите контейнер"),
  productName: z.string().min(1, "Укажите наименование товара").max(300),
  quantity: z.coerce.number().positive("Количество должно быть больше 0"),
  unit: unitEnum,
  note: z.string().max(500).optional().default(""),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type EmployeeRegisterInput = z.infer<typeof employeeRegisterSchema>;
export type ContainerCreateInput = z.infer<typeof containerCreateSchema>;
export type StorageRecordCreateInput = z.infer<typeof storageRecordCreateSchema>;
export type WebAccessCreateInput = z.infer<typeof webAccessCreateSchema>;
export type WithdrawalCreateInput = z.infer<typeof withdrawalCreateSchema>;
