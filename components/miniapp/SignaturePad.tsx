"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { useI18n } from "./i18n";

/**
 * Холст для подписи клиента от руки (шаг "Подпись" в
 * components/miniapp/NewRecordWizard.tsx) — клиент рисует пальцем/стилусом прямо на
 * экране телефона сотрудника. Внутренний битмап canvas подстраивается под
 * devicePixelRatio при монтировании, чтобы подпись не была смазанной на телефонах с
 * HiDPI-экраном; координаты указателя при этом остаются в CSS-пикселях (см. ctx.scale
 * ниже — стандартный приём для чёткого canvas на Retina/HiDPI).
 */
export default function SignaturePad({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const emptyRef = useRef(!value);
  const [empty, setEmpty] = useState(!value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth;
    const displayHeight = 180;
    canvas.width = displayWidth * ratio;
    canvas.height = displayHeight * ratio;
    canvas.style.height = `${displayHeight}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(ratio, ratio);
  }, []);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
    if (emptyRef.current) {
      emptyRef.current = false;
      setEmpty(false);
    }
  }

  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(emptyRef.current ? null : canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    emptyRef.current = true;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full touch-none rounded-2xl border-2 border-dashed border-ink-300 bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-ink-400">{t("signature.hint")}</p>
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={clear} disabled={empty}>
          <Eraser className="h-3.5 w-3.5" strokeWidth={2} />
          {t("signature.clear")}
        </button>
      </div>
    </div>
  );
}
