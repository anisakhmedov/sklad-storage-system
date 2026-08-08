import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import Link from "next/link";

export default async function DashboardHome() {
  await connectDB();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [pendingCount, containersCount, recordsThisMonth, totalRecords] = await Promise.all([
    Employee.countDocuments({ status: "pending" }),
    Container.countDocuments(),
    StorageRecord.countDocuments({ createdAt: { $gte: startOfMonth } }),
    StorageRecord.countDocuments(),
  ]);

  const stats = [
    { label: "Заявок на подтверждение", value: pendingCount, href: "/dashboard/employees" },
    { label: "Контейнеров", value: containersCount, href: "/dashboard/containers" },
    { label: "Записей за этот месяц", value: recordsThisMonth, href: "/dashboard/records" },
    { label: "Всего записей", value: totalRecords, href: "/dashboard/records" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-6">Обзор</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card hover:shadow-md transition-shadow">
            <div className="text-3xl font-semibold text-brand-700">{s.value}</div>
            <div className="text-sm text-slate-500 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {pendingCount > 0 && (
        <div className="card mt-6 border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-800">
            Есть {pendingCount} заявок на регистрацию сотрудников, ожидающих подтверждения.{" "}
            <Link href="/dashboard/employees" className="underline font-medium">
              Перейти к подтверждению →
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
