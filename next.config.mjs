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
    // pdfkit хранит свои встроенные шрифтовые метрики (Helvetica.afm и т.п.) как файлы
    // рядом с собой в node_modules/pdfkit и читает их с диска по относительному пути в
    // рантайме. При обычном webpack-бандлинге serverless-функции эти файлы теряются
    // (весь код схлопывается в один chunks/*.js) — получаем ENOENT в проде. Исключаем
    // pdfkit из webpack-бандла: тогда @vercel/nft просто трассирует и копирует его
    // node_modules-папку как есть, вместе с data/*.afm.
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

export default nextConfig;
