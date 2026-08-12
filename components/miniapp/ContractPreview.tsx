"use client";

import { CONTRACT_BLOCKS } from "@/lib/contract/contractTemplateBlocks";
import { fill } from "@/lib/contract/placeholders";

/**
 * Читаемый текст договора внутри Mini App — шаг "Договор" в
 * components/miniapp/NewRecordWizard.tsx, клиент читает его на экране сотрудника перед
 * тем, как расписаться (шаг "Подпись"). Проходит по тем же CONTRACT_BLOCKS, что и PDF
 * (lib/contract/generateContract.ts), просто рендерит их как HTML вместо pdfkit-примитивов —
 * не претендует на пиксельное соответствие PDF, только на читаемость.
 */
export default function ContractPreview({ map }: { map: Record<string, string> }) {
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-ink-700">
      {CONTRACT_BLOCKS.map((block, i) => {
        switch (block.kind) {
          case "title":
            return (
              <h2 key={i} className="text-center text-base font-bold text-ink-900">
                {fill(block.text, map)}
              </h2>
            );
          case "subtitle":
            return (
              <p key={i} className="text-center text-xs text-ink-500">
                {fill(block.text, map)}
              </p>
            );
          case "meta":
            return (
              <p key={i} className="flex justify-between gap-2 text-xs text-ink-500">
                {block.text
                  .split(/\s{2,}/)
                  .filter(Boolean)
                  .map((part, j) => (
                    <span key={j}>{fill(part, map)}</span>
                  ))}
              </p>
            );
          case "intro":
          case "para":
            return (
              <p key={i} className="text-justify">
                {fill(block.text, map)}
              </p>
            );
          case "bullet":
            return (
              <p key={i} className="pl-3 text-justify">
                • {fill(block.text, map)}
              </p>
            );
          case "heading":
            return (
              <h3 key={i} className="mt-3 font-semibold text-ink-900">
                {fill(block.text, map)}
              </h3>
            );
          case "appendixTitle":
            return (
              <h3 key={i} className="mt-5 text-center font-bold text-ink-900">
                {fill(block.text, map)}
              </h3>
            );
          case "appendixSubtitle":
            return (
              <p key={i} className="text-center font-semibold text-ink-800">
                {fill(block.text, map)}
              </p>
            );
          case "closingLabel":
            return (
              <p key={i} className="mt-3 font-semibold text-ink-900">
                {fill(block.text, map)}
              </p>
            );
          case "closingLine":
            return <p key={i}>{fill(block.text, map)}</p>;
          case "tariffBlock":
            return (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-ink-200 p-3 text-xs">
                <div>
                  <div className="text-ink-400">Саклаш Тури</div>
                  <div className="font-medium text-ink-900">{map["<Информация про всю аренду>"]}</div>
                </div>
                <div>
                  <div className="text-ink-400">Тариф</div>
                  <div className="font-medium text-ink-900">{map["<Тариф>"]}</div>
                </div>
              </div>
            );
          // "signatureBlock" — не рендерится здесь: подпись оформляется на отдельном шаге
          // мастера (components/miniapp/SignaturePad.tsx), а не как часть чтения текста.
          case "signatureBlock":
          default:
            return null;
        }
      })}
    </div>
  );
}
