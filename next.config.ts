import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Tách cache dev vs build để build không giết dev trên Windows (Option 3)
  // dev (NODE_ENV=development) -> .next-dev, build/start (production) -> .next
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  transpilePackages: ["pdfjs-dist"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default withNextIntl(nextConfig);
