import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { fa, latin } from "./fonts";
import "./globals.css";



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
