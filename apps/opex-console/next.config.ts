import path from "node:path";
import type { NextConfig } from "next";

// The console talks to OPEX through same-origin rewrites, so the SameSite=Strict session cookie
// and the CSRF header work without CORS. OPEX_API_URL is the internal API address.
const api = process.env.OPEX_API_URL ?? "http://127.0.0.1:4000";
// Site images (/images/…) are previewed from the website.
const site = process.env.SITE_URL ?? "http://127.0.0.1:3210";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    return [
      // Only the console API: partner, delivery and render routes are not reachable via this host (S2).
      { source: "/v1/manage/:path*", destination: `${api}/v1/manage/:path*` },
      { source: "/v1/docs/:path*", destination: `${api}/v1/docs/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
      { source: "/images/:path*", destination: `${site}/images/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
