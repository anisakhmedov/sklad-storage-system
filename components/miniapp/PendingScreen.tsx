"use client";

import { Clock, Ban } from "lucide-react";
import { useI18n } from "./i18n";

export default function PendingScreen({ status }: { status: "pending" | "rejected" }) {
  const { t } = useI18n();
  const isPending = status === "pending";
  return (
    <div className="pt-20 text-center">
      <div
        className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
          isPending ? "bg-amber-100 text-amber-600" : "bg-rose-100 text-rose-600"
        }`}
      >
        {isPending ? <Clock className="h-7 w-7" strokeWidth={1.8} /> : <Ban className="h-7 w-7" strokeWidth={1.8} />}
      </div>
      <h1 className="text-lg font-semibold text-ink-900 mb-2">
        {isPending ? t("pending.pendingTitle") : t("pending.rejectedTitle")}
      </h1>
      <p className="text-sm text-ink-400 px-4 leading-relaxed">
        {isPending ? t("pending.pendingText") : t("pending.rejectedText")}
      </p>
    </div>
  );
}
