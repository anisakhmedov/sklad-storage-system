import { connectDB } from "@/lib/db";
import { Employee } from "@/models/Employee";
import { Container } from "@/models/Container";
import { StorageRecord } from "@/models/StorageRecord";
import { requireWebUser } from "@/lib/auth";
import Link from "next/link";
import InventoryPanel from "@/components/dashboard/InventoryPanel";
import { UserCheck, Boxes, CalendarDays, ClipboardList, ArrowRight, AlertTriangle, Wallet } from "lucide-react";

export default async function DashboardHome() {
  const user = await requireWebUser();
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
    {
      label: "Заявок на подтверждение",
      value: pendingCount,
      href: "/dashboard/employees",
      icon: UserCheck,
      tone: pendingCount > 0 ? "amber" : "brand",
    },
    { label: "Контейнеров", value: containersCount, href: "/dashboard/containers", icon: Boxes, tone: "brand" },
    {
      label: "Записей за этот месяц",
      value: recordsThisMonth,
      href: "/dashboard/records",
      icon: CalendarDays,
      tone: "brand",
    },
    { label: "Всего записей", value: totalRecords, href: "/dashboard/records", icon: ClipboardList, tone: "brand" },
  ] as const;

  const toneClasses: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <div>
      <div className="mb-7 flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="section-eyebrow">Панель управления</p>
          <h1 className="section-title mt-1">Обзор</h1>
        </div>
        <Link href="/dashboard/income" className="btn-primary">
          <Wallet className="h-4 w-4" strokeWidth={2.1} />
          Приход от клиентов
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card card-hover group">
            <div className="flex items-start justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[s.tone]}`}>
                <s.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <ArrowRight className="h-4 w-4 text-ink-300 transition-all duration-200 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100" strokeWidth={2.25} />
            </div>
            <div className="text-3xl font-semibold text-ink-900 mt-4 tracking-tight tabular-nums">{s.value}</div>
            <div className="text-sm text-ink-400 mt-1">{s.label}</div>
          </Link>
        ))}
      </div>

      {pendingCount > 0 && (
        <Link href="/dashboard/employees" className="alert-warning mt-6 group hover:border-amber-300 transition-colors">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2} />
          <span className="flex-1">
            Есть <b>{pendingCount}</b> {pendingCount === 1 ? "заявка" : "заявок"} на регистрацию сотрудников,
            ожидающих подтверждения.
          </span>
          <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap">
            Перейти
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
          </span>
        </Link>
      )}

      {user?.role === "owner" && <InventoryPanel />}
    </div>
  );
}
