import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import raw from "@/content/applications.json";
import type { Applications } from "@/lib/applicationsText";
import styles from "./Applications.module.css";
import IndustryShowcase from "./IndustryShowcase";
import SolutionFinder from "./SolutionFinder";
import Projects from "./Projects";
import Faq from "./Faq";

/**
 * Applications page: the industry tabs (every panel in the HTML), the solution finder, sample
 * projects with their lightbox, and the FAQ filtered by industry. Content: content/applications.json.
 */
const a = raw as unknown as Applications;
const refs = {
  closures: {
    flipTop: { name: { fa: "درب فلیپ‌تاپ پیچی", en: "Screw-on flip-top cap", tr: "Vidalı flip-top kapak" }, image: "/images/product/cap-flip-top.webp" },
    screw: { name: { fa: "درب پیچی", en: "Screw cap", tr: "Vidalı kapak" }, image: "/images/product/cap-screw.webp" },
    standUp: { name: { fa: "درب ایستاده", en: "Stand-up cap", tr: "Ayakta duran kapak" }, image: "/images/product/cap-stand-up.webp" },
    nozzle: { name: { fa: "درب نازل‌دار", en: "Nozzle cap", tr: "Nozullu kapak" }, image: "/images/product/cap-nozzle.webp" },
  },
  techs: { flexo: { fa: "چاپ فلکسو", en: "Flexo" }, offset: { fa: "چاپ افست خشک", en: "Dry offset" }, silk: { fa: "چاپ سیلک", en: "Silk screen" }, hotstamp: { fa: "هات استمپ", en: "Hot stamping" }, combination: { fa: "چاپ ترکیبی", en: "Combination" } },
};

const meta = {
  title: "Applications/Page sections",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const page = (children: React.ReactNode) => <div className={styles.page}>{children}</div>;

/** The tabs show one industry at a time; arrow keys move between them. */
export const Industries: Story = {
  render: (_, { globals }) => page(<IndustryShowcase c={a.industries} locale={globals.locale ?? "fa"} />),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const pharma = await c.findByRole("tab", { name: /دارویی/ });
    await userEvent.click(pharma);
    await expect(pharma).toHaveAttribute("aria-selected", "true");
    // The panel fades in.
    await waitFor(() => expect(c.getByRole("heading", { name: /محافظت مطمئن از دارو/ })).toBeVisible());
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(c.getByRole("tab", { name: /غذایی/ })).toHaveAttribute("aria-selected", "true"));
  },
};

/** Choosing contents and a priority changes the suggested closures and print methods. */
export const Finder: Story = {
  render: (_, { globals }) => page(<SolutionFinder c={a.finder} industries={a.industries.items} refs={refs} locale={globals.locale ?? "fa"} />),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByLabelText("دارویی"));
    await userEvent.click(c.getByLabelText("ایمنی و هشدارها"));
    await expect(c.getByRole("heading", { name: /دارویی · کرم \/ ماده غلیظ · ایمنی و هشدارها/ })).toBeVisible();
    await expect(c.getByRole("link", { name: "چاپ سیلک" })).toBeVisible();
    await userEvent.click(c.getByLabelText("سایر"));
    await expect(c.getByText("درب نازل‌دار")).toBeVisible();
  },
};

/** Filter by industry, then open a sample in the lightbox and step to the next one. */
export const ProjectsLightbox: Story = {
  render: (_, { globals }) => page(<Projects c={a.projects} industries={a.industries.items} locale={globals.locale ?? "fa"} />),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "دارویی" }));
    await expect(c.queryByText("کرم دست اسطوخودوس")).toBeNull();
    await userEvent.click(c.getByRole("button", { name: /ژل کلسیم/ }));
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "ژل کلسیم" })).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "نمونهٔ بعدی" }));
    await expect(within(dialog).getByRole("heading", { name: "تیوب قرص جوشان" })).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "بستن" }));
  },
};

/** The industry filter keeps general questions and hides other industries' ones. */
export const FaqByIndustry: Story = {
  render: (_, { globals }) => page(<Faq c={a.faq} industries={a.industries.items} locale={globals.locale ?? "fa"} />),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("button", { name: "صنعتی" }));
    await expect(c.getByText("برای مواد خورنده یا چسب چه تیوبی مناسب است؟")).toBeVisible();
    await expect(c.getByText("برای دریافت قیمت چه اطلاعاتی لازم است؟")).toBeVisible();
    await expect(c.queryByText("درب سیلیکاژلی چه کاری انجام می‌دهد؟")).not.toBeVisible();
  },
};
