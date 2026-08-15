import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";
import { ownerKeyOf } from "@/lib/ownerKey";

/**
 * Поиск уже существовавших владельцев груза — для повторного назначения клиента в мастере
 * новой записи (см. components/miniapp/NewRecordWizard.tsx, шаг "owner"): сотрудник вводит
 * телефон/ФИО/ИНН, выбирает из списка "кто уже был" — и все паспортные/реквизитные поля
 * подставляются из его последней записи, вместо повторного ввода с нуля. Данные владельца НЕ
 * нормализованы в отдельную коллекцию (goodsOwner живёт прямо на StorageRecord, см.
 * models/StorageRecord.ts), поэтому берём самую свежую запись на каждого уникального
 * ownerKey — в ней самые актуальные данные (паспорт мог обновиться при перевыпуске и т.п.).
 *
 * Не ограничивается доступными сотруднику контейнерами (в отличие от employeeCanAccessContainer
 * в других /api/miniapp/records/* маршрутах) — это справочные контактные данные клиента, а не
 * данные конкретного контейнера, и сотрудник в любом случае продолжит оформление в контейнере,
 * к которому у него есть доступ (это проверяется отдельно при создании записи).
 */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ owners: [] });

    await connectDB();
    // Экранируем спецсимволы regex — q приходит от пользователя.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");

    const records = await StorageRecord.find({
      $or: [
        { "goodsOwner.fullName": re },
        { "goodsOwner.phone": re },
        { "goodsOwner.companyName": re },
        { "goodsOwner.inn": re },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200) // с запасом на дубли одного и того же владельца — схлопываются ниже
      .select("goodsOwner createdAt")
      .lean();

    const seen = new Map<string, (typeof records)[number]>();
    for (const r of records) {
      const key = ownerKeyOf(r.goodsOwner as any);
      if (!seen.has(key)) seen.set(key, r);
      if (seen.size >= 15) break;
    }

    const owners = Array.from(seen.entries()).map(([ownerKey, r]) => ({
      ownerKey,
      goodsOwner: r.goodsOwner,
    }));

    return NextResponse.json({ owners });
  } catch (err) {
    console.error("GET /api/miniapp/owners/search:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
