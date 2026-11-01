import type { NextConfig } from "next";

const year = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle (.next/standalone) for the Linux installer and Docker image.
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [480, 768, 1024, 1280, 1440, 1920, 2560, 3840],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  experimental: {
    // Inline the (small) CSS into the HTML: no render-blocking stylesheet requests.
    inlineCss: true,
    optimizePackageImports: ["@animate-ui/react", "radix-ui", "motion"],
  },
  async headers() {
    return [
      { source: "/images/:path*", headers: [{ key: "Cache-Control", value: year }] },
      { source: "/files/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
