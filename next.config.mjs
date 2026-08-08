/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  // На Vercel каждый API-роут трассируется и упаковывается в отдельную serverless-функцию
  // (@vercel/nft) по факту используемых require/import. Шрифты для генерации PDF договора
  // (lib/contract/generateContract.ts) читаются с диска по пути вне обычного графа импортов
  // (path.join(process.cwd(), "templates/fonts/...")), поэтому трассировка может их не
  // подхватить сама — включаем явно для всех API-роутов (используется только теми, что
  // реально генерируют договор: records/[id]/contract, miniapp/records, telegram/webhook).
  experimental: {
    outputFileTracingIncludes: {
      "/api/**/*": ["./templates/fonts/**"],
    },
  },
};

export default nextConfig;
