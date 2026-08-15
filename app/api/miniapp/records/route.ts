import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { StorageRecord } from "@/models/StorageRecord";
import { Container } from "@/models/Container";
import { Firm } from "@/models/Firm";
import { Client } from "@/models/Client";
import { resolveEmployee, employeeCanAccessContainer } from "@/lib/miniAuth";
import { storageRecordCreateSchema } from "@/lib/validation";
import { jsonError, zodErrorResponse } from "@/lib/apiHelpers";
import { logAudit } from "@/lib/audit";
import { notifyGoodsOwnerRegistered, sendContractToEmployee } from "@/lib/telegramNotify";
import { getNextSequence } from "@/lib/counter";
import { decodePngDataUrl } from "@/lib/signature";
import { suggestedEndDate } from "@/lib/tariff";

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { tgUser, employee } = await resolveEmployee(req);
  if (!tgUser) return jsonError("Не удалось проверить данные Telegram", 401);
  if (!employee || employee.status !== "approved") {
    return jsonError("Доступ разрешён только подтверждённым сотрудникам", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = storageRecordCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  if (!employeeCanAccessContainer(employee, parsed.data.containerId)) {
    return jsonError("Нет доступа к этому контейнеру", 403);
  }

  await connectDB();
  const container = await Container.findById(parsed.data.containerId);
  if (!container) return jsonError("Контейнер не найден", 404);

  // Камера, вручную отмеченная как "заполнена" (см. models/Container.ts::fullCells),
  // недоступна для размещения нового груза — проверяем на сервере, а не только в UI
  // мастера (см. components/miniapp/NewRecordWizard.tsx), т.к. клиенту нельзя доверять.
  if (container.fullCells?.includes(parsed.data.cellNumber)) {
    return jsonError("Камера отмечена как заполненная — выберите другую", 409);
  }

  // Клиент — РОВНО один из двух (см. lib/validation.ts::storageRecordCreateSchema,
  // models/Client.ts): либо уже существующая карточка (сотрудник выбрал из поиска — см. GET
  // /api/miniapp/clients/search), либо новая заводится прямо здесь. Без явного выбора из поиска
  // совпадение телефона с чьей-то ещё карточкой НИКОГДА не подставляет чужого клиента молча.
  let client;
  if (parsed.data.clientId) {
    client = await Client.findById(parsed.data.clientId);
    if (!client) return jsonError("Клиент не найден — обновите поиск и выберите заново", 404);
  } else {
    client = await Client.create({
      profile: parsed.data.newClient,
      createdBy: employee.name,
    });
  }
  const goodsOwner = client.profile;

  // Подпись клиента (см. components/miniapp/SignaturePad.tsx) обязательна для физлиц — для
  // нового клиента это уже проверила storageRecordCreateSchema (superRefine), а для уже
  // существующего клиента (clientId, тип известен только после его загрузки выше) проверяем
  // здесь — тем же способом, каким раньше пользовался общий superRefine.
  let clientSignatureBuffer: Buffer | undefined;
  if (goodsOwner.type === "individual") {
    if (!parsed.data.clientSignaturePng) return jsonError("Клиент должен подписать договор", 400);
    const decoded = decodePngDataUrl(parsed.data.clientSignaturePng);
    if (!decoded) return jsonError("Некорректный формат подписи клиента", 400);
    if (decoded.length > MAX_SIGNATURE_BYTES) return jsonError("Файл подписи слишком большой", 400);
    clientSignatureBuffer = decoded;
  }

  // Номер договора присваивается один раз, только физлицам (только для них формируется
  // договор, см. lib/contract/generateContract.ts) — последовательность по текущему году
  // (см. lib/counter.ts, README → «Номер договора»).
  const contractNumber =
    goodsOwner.type === "individual"
      ? `${await getNextSequence(`contract:${new Date().getFullYear()}`)}-${new Date().getFullYear()}`
      : undefined;

  // Снимок реквизитов выбранной фирмы (см. models/Firm.ts) — если сотрудник ничего не выбрал
  // (или firmId не найден), issuingFirm остаётся не заполненным, и документы используют
  // lib/contract/firmDefaults.ts::DEFAULT_FIRM (см. lib/contract/placeholders.ts,
  // lib/contract/generateAct.ts). Второй рубеж защиты: если клиент не прислал firmId (напр.
  // мастер пропустил шаг "firm", т.к. контейнер уже привязан к фирме — см.
  // models/Container.ts::firmId), берём фирму контейнера — API не полагается на то, что клиент
  // обязательно продублирует её в теле запроса.
  let issuingFirm: InstanceType<typeof StorageRecord>["issuingFirm"];
  const effectiveFirmId = parsed.data.firmId || (container.firmId ? String(container.firmId) : undefined);
  if (effectiveFirmId) {
    const firm = await Firm.findById(effectiveFirmId).lean();
    if (firm) {
      issuingFirm = {
        name: firm.name,
        directorFullName: firm.directorFullName,
        directorShortName: firm.directorShortName,
        address: firm.address,
        bankBranch: firm.bankBranch,
        bankAccount: firm.bankAccount,
        inn: firm.inn,
        bankCode: firm.bankCode,
      };
    }
  }

  const record = await StorageRecord.create({
    containerId: parsed.data.containerId,
    cellNumber: parsed.data.cellNumber,
    clientId: client._id,
    productName: parsed.data.productName,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    // Снимок профиля клиента НА МОМЕНТ создания записи — см. models/StorageRecord.ts::goodsOwner.
    goodsOwner,
    tariff: parsed.data.tariff,
    createdByEmployeeId: employee._id,
    contractNumber,
    clientSignaturePng: clientSignatureBuffer,
    signedAt: clientSignatureBuffer ? new Date() : undefined,
    issuingFirm,
    // Сотрудник мог поправить подсказанную дату в мастере (см. NewRecordWizard) — если нет,
    // считаем сами по тарифу (см. lib/tariff.ts::suggestedEndDate); per_day подсказки не даёт.
    expectedEndDate: parsed.data.expectedEndDate ?? suggestedEndDate(parsed.data.tariff.type, new Date()) ?? undefined,
  });

  await logAudit({
    entity: "StorageRecord",
    entityId: record._id,
    action: "create",
    actorId: String(employee._id),
    actorRole: "employee",
    changes: {
      containerId: parsed.data.containerId,
      productName: parsed.data.productName,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
    },
  });

  // Уведомления — часть 2/3 ТЗ. Best-effort: сбой Telegram (или отсутствие токена в dev)
  // не должен ронять сохранение записи, поэтому запись уже успешно создана и отвечена
  // клиенту независимо от результата этих вызовов (см. lib/telegramNotify.ts).
  if (record.goodsOwner.type === "individual") {
    await Promise.all([
      notifyGoodsOwnerRegistered(record, container.name),
      sendContractToEmployee(employee.telegramId, record, container.name),
    ]);
  }

  return NextResponse.json({ record: { id: String(record._id) } });
}
