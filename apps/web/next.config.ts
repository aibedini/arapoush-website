import path from "node:path";
import type { NextConfig } from "next";

const year = "public, max-age=31536000, immutable";

/**
 * The old industry pages (arapoush.com, before this site) now live on one applications page, each as
 * a panel: 301 to /{locale}/applications#{industry}. Persian slugs are matched percent-encoded, as
 * browsers and crawlers send them.
 */
const oldIndustryPages: [string, string][] = [
  ["/تیوب-بدون-درز-پلاستیکی-آرایشی", "/fa/applications#cosmetics"],
  ["/بسته-بندی-تیوب-محصولات-بهداشتی", "/fa/applications#hygiene"],
  ["/بسته-بندی-اکستروژن-محصولات-دارویی", "/fa/applications#pharma"],
  ["/راهکارهای-بسته-بندی-تیوب-محصولات-خوراکی", "/fa/applications#food"],
  ["/تیوب-بدون-درز-چند-لایه-محصولات-صنعتی", "/fa/applications#industrial"],
  ["/tubes-cosmetic", "/en/applications#cosmetics"],
  ["/tubes-hygienic", "/en/applications#hygiene"],
  ["/tubes-pharmaceutical", "/en/applications#pharma"],
  ["/tubes-food", "/en/applications#food"],
  ["/tubes-industrial", "/en/applications#industrial"],
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle (.next/standalone) for the Linux installer and Docker image.
  output: "standalone",
  // Monorepo: trace from the workspace root so pnpm-linked dependencies land in the bundle
  // (the server ends up at .next/standalone/apps/web/server.js).
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Shared OPEX content types (TypeScript source).
  transpilePackages: ["@arapoush/schema"],
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 768, 1024, 1280, 1440, 1920, 2560, 3840],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    // Inline the (small) CSS into the HTML: no render-blocking stylesheet requests.
    inlineCss: true,
    // With inlined CSS, merged chunks put other pages' styles into every page (the tube page carried
    // the about, printing and home sections' CSS). Strict chunking keeps each page to its own imports.
    cssChunking: "strict",
    optimizePackageImports: ["@animate-ui/react", "radix-ui", "motion"],
  },
  async redirects() {
    return oldIndustryPages.flatMap(([from, to]) => {
      const encoded = encodeURI(from);
      return [...new Set([from, encoded])].map((source) => ({ source, destination: to, permanent: true }));
    });
  },
  // Media uploaded in OPEX is served same-origin (no third-party host in CSP, no cookies sent to OPEX).
  async rewrites() {
    const opex = process.env.OPEX_DELIVERY_URL?.replace(/\/$/, "");
    return opex ? [{ source: "/media/:path*", destination: `${opex}/media/:path*` }] : [];
  },
  async headers() {
    const opexConsole = process.env.OPEX_CONSOLE_ORIGIN?.replace(/\/$/, "");
    return [
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/files/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      { source: "/api/opex/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The OPEX console shows draft previews in frames; only that origin may embed the site.
          opexConsole ? { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${opexConsole}` } : { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
