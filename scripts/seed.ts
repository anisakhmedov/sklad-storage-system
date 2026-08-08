/**
 * Seed-скрипт: создаёт bootstrap-владельца, пару контейнеров, тестового сотрудника
 * и несколько записей о размещении товара — чтобы можно было сразу проверить панель.
 *
 * Запуск: npm run seed  (нужен настроенный .env.local с MONGODB_URI)
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Employee } from "../models/Employee";
import { Container } from "../models/Container";
import { StorageRecord } from "../models/StorageRecord";
import { WebAccess } from "../models/WebAccess";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI не задан. Скопируйте .env.example в .env.local и заполните.");
  }

  await mongoose.connect(uri);
  console.log("Подключено к MongoDB");

  // --- Владелец ---
  const ownerIdentifier = (process.env.OWNER_IDENTIFIER || "owner").toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD || "change-me-123";
  const ownerHash = await bcrypt.hash(ownerPassword, 10);

  await WebAccess.findOneAndUpdate(
    { identifier: ownerIdentifier },
    {
      identifier: ownerIdentifier,
      passwordHash: ownerHash,
      grantedBy: "system",
      role: "owner",
      status: "active",
      mustChangePassword: false,
    },
    { upsert: true, new: true }
  );
  console.log(`Владелец готов: identifier="${ownerIdentifier}", password="${ownerPassword}"`);

  // --- Контейнеры ---
  const containerA = await Container.findOneAndUpdate(
    { name: "Контейнер №1" },
    { name: "Контейнер №1", description: "Основной склад, холодная зона", createdBy: ownerIdentifier },
    { upsert: true, new: true }
  );
  const containerB = await Container.findOneAndUpdate(
    { name: "Контейнер №2" },
    { name: "Контейнер №2", description: "Резервный контейнер", createdBy: ownerIdentifier },
    { upsert: true, new: true }
  );
  console.log("Контейнеры готовы:", containerA.name, containerB.name);

  // --- Тестовый сотрудник ---
  const employee = await Employee.findOneAndUpdate(
    { telegramId: "111111111" },
    {
      name: "Тестовый сотрудник",
      phone: "+998901112233",
      telegramId: "111111111",
      telegramUsername: "test_employee",
      status: "approved",
    },
    { upsert: true, new: true }
  );
  console.log("Сотрудник готов:", employee.name, `(telegramId=${employee.telegramId}, approved)`);

  // Ещё один сотрудник в статусе pending — чтобы сразу видеть раздел "заявки"
  await Employee.findOneAndUpdate(
    { telegramId: "222222222" },
    {
      name: "Новый сотрудник",
      phone: "+998907778899",
      telegramId: "222222222",
      telegramUsername: "new_employee",
      status: "pending",
    },
    { upsert: true, new: true }
  );

  // --- Тестовые записи ---
  // Телефон первой записи (+998901234567) сознательно тот же, что стоит указать в
  // Telegram-профиле при ручной проверке идентификации владельца груза через бота
  // (см. README → «Уведомления и сводка владельцам груза», раздел «Как проверить руками»).
  const existingRecords = await StorageRecord.countDocuments();
  if (existingRecords === 0) {
    await StorageRecord.create([
      {
        containerId: containerA._id,
        productName: "Яблоки",
        quantity: 5,
        unit: "tonne",
        goodsOwner: {
          type: "individual",
          fullName: "Иванов Иван Иванович",
          phone: "+998901234567",
          passportData: "AB1234567",
          pinfl: "12345678901234",
          passportIssueDate: "12.05.2020",
          passportIssuedBy: "Самаркандский областной ОВД",
        },
        payment: { amount: 500000, method: "cash" },
        createdByEmployeeId: employee._id,
      },
      {
        containerId: containerA._id,
        productName: "Картофель",
        quantity: 120,
        unit: "box",
        goodsOwner: {
          type: "individual",
          fullName: "Иванов Иван Иванович",
          phone: "+998901234567",
          passportData: "AB1234567",
          pinfl: "12345678901234",
          passportIssueDate: "12.05.2020",
          passportIssuedBy: "Самаркандский областной ОВД",
        },
        payment: { amount: 150000, method: "terminal" },
        createdByEmployeeId: employee._id,
      },
      {
        containerId: containerB._id,
        productName: "Мука",
        quantity: 2000,
        unit: "kg",
        goodsOwner: {
          type: "individual",
          fullName: "Сидорова Анна Владимировна",
          phone: "+998909876543",
          passportData: "EF1122334",
          pinfl: "56789012345678",
          passportIssueDate: "03.11.2018",
          passportIssuedBy: "Булунгурский районный ОВД",
        },
        payment: { amount: 800000, method: "transfer" },
        createdByEmployeeId: employee._id,
      },
      {
        containerId: containerB._id,
        productName: "Рис (мешки)",
        quantity: 300,
        unit: "box",
        goodsOwner: {
          type: "company",
          companyName: 'ООО "Samarqand Agro Trade"',
          inn: "305874112",
          directorName: "Каримов Бахтиёр Рустамович",
        },
        payment: { amount: 1200000, method: "transfer" },
        createdByEmployeeId: employee._id,
      },
    ]);
    console.log("Тестовые записи созданы (4 шт.: 3 физлица на 2 номерах + 1 юрлицо)");
  } else {
    console.log("Записи уже существуют — пропускаем создание тестовых записей");
  }

  console.log("\nГотово. Можно запускать `npm run dev` и заходить в /login.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
