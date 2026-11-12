import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { helvetica, inter, jetbrains, vazirmatn } from "../app/fonts";
import { localeMeta, type Locale } from "../lib/i18n/config";
import "../app/globals.css";

/**
 * Every story renders inside the page shell the site uses: the locale's `lang`/`dir` (Persian RTL,
 * English and Turkish LTR), the four typefaces and the global CSS. Pick the language in the toolbar.
 */
const withLocale: Decorator = (Story, ctx) => {
  const locale = (ctx.globals.locale ?? "fa") as Locale;
  return (
    <div lang={locale} dir={localeMeta[locale].dir} className={`${helvetica.variable} ${vazirmatn.variable} ${inter.variable} ${jetbrains.variable}`} style={{ fontFamily: "var(--font-sans)", padding: 24 }}>
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withLocale],
  globalTypes: {
    locale: {
      description: "Site language (sets lang and dir)",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: [
          { value: "fa", title: "فارسی (RTL)" },
          { value: "en", title: "English (LTR)" },
          { value: "tr", title: "Türkçe (LTR)" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: "fa" },
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    a11y: { test: "error" },
    viewport: {
      options: {
        mobile: { name: "Mobile 390", styles: { width: "390px", height: "844px" } },
        tablet: { name: "Tablet 768", styles: { width: "768px", height: "1024px" } },
        desktop: { name: "Desktop 1440", styles: { width: "1440px", height: "900px" } },
      },
    },
    nextjs: { appDirectory: true },
  },
  tags: ["autodocs"],
};
export default preview;
