import { redirect } from "next/navigation";
import { requireWebUser } from "@/lib/auth";
import Nav from "@/components/dashboard/Nav";
import ChangePasswordGate from "@/components/dashboard/ChangePasswordGate";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireWebUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Nav identifier={user.identifier} role={user.role} />
      <main className="flex-1 p-6 md:p-8 max-w-6xl">
        {user.mustChangePassword && <ChangePasswordGate />}
        {children}
      </main>
    </div>
  );
}
