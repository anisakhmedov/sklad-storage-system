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
import { Income } from "../models/Income";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

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
  // createdAt намеренно "в прошлом" (не сейчас) — иначе начисление по тарифу на момент
  // первого запуска будет равно нулю (тариф начисляется с даты создания записи, см.
  // README → «Тарифы, оплата и задолженность»), и проверить задолженность будет не на чем.
  // В записях сознательно использованы все 4 типа тарифа — для проверки каждого.
  const existingRecords = await StorageRecord.countDocuments();
  let records: Array<InstanceType<typeof StorageRecord>> = [];
  if (existingRecords === 0) {
    records = await StorageRecord.create([
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
        tariff: { type: "per_day", rate: 30 },
        createdByEmployeeId: employee._id,
        createdAt: daysAgo(40),
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
        tariff: { type: "per_month", rate: 9000 },
        createdByEmployeeId: employee._id,
        createdAt: daysAgo(15),
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
        tariff: { type: "per_kg_month", rate: 250 },
        createdByEmployeeId: employee._id,
        createdAt: daysAgo(25),
      },
      {
        containerId: containerB._id,
        productName: "Рис",
        quantity: 1500,
        unit: "kg",
        goodsOwner: {
          type: "company",
          companyName: 'ООО "Samarqand Agro Trade"',
          inn: "305874112",
          directorName: "Каримов Бахтиёр Рустамович",
        },
        tariff: { type: "per_kg_6_months", rate: 1000 },
        createdByEmployeeId: employee._id,
        createdAt: daysAgo(50),
      },
    ]);
    console.log("Тестовые записи созданы (4 шт.: 3 физлица на 2 номерах + 1 юрлицо, все 4 типа тарифа)");
  } else {
    console.log("Записи уже существуют — пропускаем создание тестовых записей");
  }

  // --- Тестовые платежи (Income) — чтобы задолженность в /dashboard/income и в сводке
  // бота была не только начислением, но и показывала частичную/полную оплату. ---
  const existingIncomes = await Income.countDocuments();
  if (existingIncomes === 0 && records.length > 0) {
    await Income.create([
      {
        // Частичная оплата Иванова за containerA (начислено ~1200 + ~4500 сум на дату сидинга).
        ownerType: "individual",
        ownerKey: "individual:+998901234567",
        ownerLabel: "Иванов Иван Иванович",
        containerId: containerA._id,
        amount: 3000,
        method: "cash",
        paidAt: daysAgo(5),
        note: "Частичная оплата наличными",
        recordedBy: ownerIdentifier,
      },
      {
        // Переплата Сидоровой за containerB — демонстрирует случай "задолженности нет".
        ownerType: "individual",
        ownerKey: "individual:+998909876543",
        ownerLabel: "Сидорова Анна Владимировна",
        containerId: containerB._id,
        amount: 500000,
        method: "transfer",
        paidAt: daysAgo(2),
        note: "Оплата переводом",
        recordedBy: ownerIdentifier,
      },
    ]);
    console.log("Тестовые платежи созданы (2 шт.)");
  } else {
    console.log("Платежи уже существуют или записей ещё нет — пропускаем");
  }

  console.log("\nГотово. Можно запускать `npm run dev` и заходить в /login.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
