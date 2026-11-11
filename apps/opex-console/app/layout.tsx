import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";

const fa = localFont({
  variable: "--font-fa",
  display: "swap",
  src: [
    { path: "./fonts/vazirmatn-arabic-400-normal.woff2", weight: "400" },
    { path: "./fonts/vazirmatn-arabic-500-normal.woff2", weight: "500" },
    { path: "./fonts/vazirmatn-arabic-700-normal.woff2", weight: "700" },
  ],
});
const latin = localFont({
  variable: "--font-latin",
  display: "swap",
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600" },
  ],
});

export const metadata: Metadata = {
  title: { default: "OPEX", template: "%s · OPEX" },
  description: "OPEX operator console",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request makes every page dynamic, so Next stamps its scripts with the CSP nonce.
  await headers();
  return (
    <html lang="fa" dir="rtl" className={`${fa.variable} ${latin.variable}`}>
      <body>{children}</body>
    </html>
  );
}
