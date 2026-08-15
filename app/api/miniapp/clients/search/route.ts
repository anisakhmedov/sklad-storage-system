import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Client } from "@/models/Client";
import { resolveEmployee } from "@/lib/miniAuth";
import { jsonError } from "@/lib/apiHelpers";

/**
 * Поиск уже существующих клиентов (models/Client.ts) — для повторного назначения клиента в
 * мастере новой записи (см. components/miniapp/NewRecordWizard.tsx, шаг "Владелец груза"):
 * сотрудник вводит телефон/ФИО/ИНН, выбирает из списка "кто уже был" — и все паспортные/
 * реквизитные поля подставляются из его карточки, вместо повторного ввода с нуля.
 *
 * ВАЖНО: результат этого поиска — единственный способ переиспользовать существующего клиента.
 * Если сотрудник просто заполняет форму заново (даже с тем же телефоном, что уже у кого-то
 * есть) — заводится НОВАЯ карточка, а не эта (см. models/Client.ts, POST
 * /api/miniapp/records). Несколько клиентов с одним телефоном — штатный случай (напр. у
 * клиента нет своего номера), поэтому результат может содержать больше одной карточки с
 * одинаковым телефоном/ФИО — это не дубли, а разные люди.
 *
 * Не ограничивается доступными сотруднику контейнерами — это справочные контактные данные
 * клиента, а не данные конкретного контейнера, и сотрудник в любом случае продолжит оформление
 * в контейнере, к которому у него есть доступ (это проверяется отдельно при создании записи).
 */
export async function GET(req: NextRequest) {
  try {
    const { tgUser, employee } = await resolveEmployee(req);
    if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
    if (!employee || employee.status !== "approved") {
      return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json({ clients: [] });

    await connectDB();
    // Экранируем спецсимволы regex — q приходит от пользователя.
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");

    const clients = await Client.find({
      $or: [
        { "profile.fullName": re },
        { "profile.phone": re },
        { "profile.companyName": re },
        { "profile.inn": re },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(15)
      .select("profile")
      .lean();

    return NextResponse.json({
      clients: clients.map((c) => ({ clientId: String(c._id), goodsOwner: c.profile })),
    });
  } catch (err) {
    console.error("GET /api/miniapp/clients/search:", err);
    return jsonError("Внутренняя ошибка сервера", 500);
  }
}
