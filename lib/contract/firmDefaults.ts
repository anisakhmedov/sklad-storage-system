/**
 * Реквизиты фирмы-владельца склада ("Сақловчи" в тексте договора/акта) — раньше были
 * захардкожены прямо в шаблоне (lib/contract/contractTemplateBlocks.ts) и в PDF-рендерере
 * (lib/contract/generateContract.ts, lib/contract/generateAct.ts). Теперь владелец может
 * завести несколько своих фирм (models/Firm.ts) и выбирать, от чьего имени составляется
 * договор/акт (см. components/miniapp/NewRecordWizard.tsx, шаг "Фирма").
 *
 * DEFAULT_FIRM — те же значения, что были захардкожены раньше. Используется как fallback:
 * (а) для записей, созданных ДО этой доработки (StorageRecord.issuingFirm отсутствует),
 * (б) когда в системе ещё не заведено ни одной фирмы (models/Firm.ts пусто),
 * (в) для актов по инвентарю (не привязаны к конкретной фирме-подписанту записи).
 * Так поведение системы без единой заведённой фирмы остаётся БАЙТ-В-БАЙТ таким же, как до
 * этой доработки — env-agnostic файл (без pdfkit/mongoose), безопасен для импорта и в браузере.
 */
export interface FirmSnapshot {
  name: string; // полное название с орг.-правовой формой, как должно печататься в кавычках «...»
  directorFullName: string; // для вводного абзаца договора, напр. "RAXIMOV OLIMJON ALIYEVICH"
  directorShortName: string; // для строки подписи, напр. "О.Рахимов"
  address: string;
  bankBranch: string;
  bankAccount: string;
  inn: string;
  bankCode: string;
}

export const DEFAULT_FIRM: FirmSnapshot = {
  name: "INTURIST MAROQAND МЧЖ",
  directorFullName: "RAXIMOV OLIMJON ALIYEVICH",
  directorShortName: "О.Рахимов",
  address: "Самарқанд вилояти, Булунғур тумани",
  bankBranch: 'ТОШКЕНТ Ш., "ТУРОНБАНК" АТ БАНКИНИНГ БОШ ОФИСИ',
  bankAccount: "20208000500771510001",
  inn: "304871250",
  bankCode: "00446",
};
