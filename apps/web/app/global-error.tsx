"use client";

import Link from "next/link";

/** Last resort when the root layout itself fails: its own <html>, Persian by default. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center" }}>
          <h1>مشکلی پیش آمد · Something went wrong</h1>
          <p>
            <button type="button" onClick={reset} style={{ minHeight: 36, padding: "0 16px" }}>
              دوباره · Retry
            </button>{" "}
            <Link href="/fa">صفحه اصلی</Link> · <Link href="/en">Home</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
