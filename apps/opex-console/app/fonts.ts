import localFont from "next/font/local";

/** Console typefaces (shared by the layout and Storybook). */
export const fa = localFont({
  variable: "--font-fa",
  display: "swap",
  src: [
    { path: "./fonts/vazirmatn-arabic-400-normal.woff2", weight: "400" },
    { path: "./fonts/vazirmatn-arabic-500-normal.woff2", weight: "500" },
    { path: "./fonts/vazirmatn-arabic-700-normal.woff2", weight: "700" },
  ],
});
export const latin = localFont({
  variable: "--font-latin",
  display: "swap",
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600" },
  ],
});
