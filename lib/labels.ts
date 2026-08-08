import { PaymentMethod, Unit } from "@/models/StorageRecord";

/**
 * Единые русскоязычные подписи для единиц измерения и способов оплаты — используются
 * в серверном коде (PDF договора, уведомления и сводка бота). У существующих клиентских
 * компонентов (dashboard/records, NewRecordWizard) есть свои локальные копии этих же
 * подписей для UI — их не трогаем, чтобы не переписывать то, что уже работает.
 */
export const UNIT_LABELS: Record<Unit, string> = {
  tonne: "т",
  kg: "кг",
  box: "ящ.",
  piece: "шт.",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Наличные",
  terminal: "Терминал",
  transfer: "Перевод",
};
