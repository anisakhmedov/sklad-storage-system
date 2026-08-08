export default function PendingScreen({ status }: { status: "pending" | "rejected" }) {
  return (
    <div className="pt-16 text-center">
      <div className="text-5xl mb-4">{status === "pending" ? "⏳" : "🚫"}</div>
      <h1 className="text-lg font-semibold text-slate-800 mb-2">
        {status === "pending" ? "Ожидайте подтверждения" : "Заявка отклонена"}
      </h1>
      <p className="text-sm text-slate-500 px-4">
        {status === "pending"
          ? "Ваша заявка отправлена владельцу и ожидает подтверждения. Как только доступ будет одобрен, откройте приложение снова."
          : "Ваша заявка на регистрацию была отклонена. Свяжитесь с владельцем склада для уточнения."}
      </p>
    </div>
  );
}
