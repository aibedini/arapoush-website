import localFont from "next/font/local";

/** The site's typefaces (shared by the locale layout and Storybook). */
// Primary Latin typeface of the design (licensed files supplied by the client, subset to Latin).
export const helvetica = localFont({
  src: [
    { path: "./fonts/helvetica-neue-300.woff2", weight: "300" },
    { path: "./fonts/helvetica-neue-400.woff2", weight: "400" },
    { path: "./fonts/helvetica-neue-500.woff2", weight: "500" },
    { path: "./fonts/helvetica-neue-700.woff2", weight: "700" },
  ],
  variable: "--font-helvetica",
  display: "swap",
  // Not preloaded: the size-adjusted fallback holds layout while the hero image wins the bandwidth.
  preload: false,
  fallback: ["Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
});

// Persian script (OFL). Arabic-script subset only: Latin falls through to Helvetica Neue.
export const vazirmatn = localFont({
  src: [
    { path: "./fonts/vazirmatn-arabic-300-normal.woff2", weight: "300" },
    { path: "./fonts/vazirmatn-arabic-400-normal.woff2", weight: "400" },
    { path: "./fonts/vazirmatn-arabic-500-normal.woff2", weight: "500" },
    { path: "./fonts/vazirmatn-arabic-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-vazir",
  display: "swap",
  // Our own fallback (app/globals.css "Vazirmatn Fallback"): next/font sizes it for Latin metrics, which
  // leaves Persian text ~14% narrower than Vazirmatn, so lines re-wrap when the font arrives (CLS).
  adjustFontFallback: false,
  fallback: ["Vazirmatn Fallback", "Tahoma", "sans-serif"],
});

// Self-hosted (OFL) so builds and first paint never depend on a font CDN.
export const inter = localFont({
  src: [
    { path: "./fonts/inter-latin-300-normal.woff2", weight: "300" },
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/inter-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

// The hero wordmark is set in JetBrains Mono Bold in the Figma file.
export const jetbrains = localFont({
  src: [{ path: "./fonts/jetbrains-mono-latin-700-normal.woff2", weight: "700" }],
  variable: "--font-jetbrains",
  display: "block",
});
