import { NextRequest, NextResponse } from "next/server";
import { requireWebUser } from "@/lib/auth";
import { jsonError } from "@/lib/apiHelpers";
import {
  getMonthlyVolume,
  getContainerLoad,
  getPaymentsByMethod,
  getContainerBalances,
} from "@/lib/reports";

export async function GET(req: NextRequest) {
  const user = await requireWebUser();
  if (!user) return jsonError("Не авторизован", 401);

  const sp = req.nextUrl.searchParams;
  const year = Number(sp.get("year")) || new Date().getFullYear();
  const month = sp.get("month") ? Number(sp.get("month")) : null; // 1-12, опционально

  let from: Date;
  let to: Date;
  if (month) {
    from = new Date(Date.UTC(year, month - 1, 1));
    to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  } else {
    from = new Date(Date.UTC(year, 0, 1));
    to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  }

  const [monthlyVolume, containerLoad, paymentsByMethod, containerBalances] = await Promise.all([
    getMonthlyVolume({ from, to }),
    getContainerLoad({ from, to }),
    getPaymentsByMethod({ from, to }),
    getContainerBalances(),
  ]);

  return NextResponse.json({ monthlyVolume, containerLoad, paymentsByMethod, containerBalances });
}
