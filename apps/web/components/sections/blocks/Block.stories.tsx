import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { dict } from "../../../.storybook/fixtures";
import Block from "./Block";

/**
 * Page-builder blocks (P12). Operators add them in the visual editor; their content lives in the
 * home layout (`sections[i].props`). Text and spacing come from the site's tokens; nothing here is
 * free-form styling.
 */
const meta = {
  title: "Page builder/Block",
  component: Block,
  args: { kind: "richText", id: "block-1", props: {}, locale: "fa", t: dict("fa") },
  render: (args, { globals }) => <Block {...args} locale={globals.locale ?? "fa"} t={dict(globals.locale)} />,
} satisfies Meta<typeof Block>;
export default meta;
type Story = StoryObj<typeof meta>;

const title = { fa: "چرا تیوب چندلایه؟", en: "Why a multi-layer tube?", tr: "Neden çok katmanlı tüp?" };
const body = {
  fa: "لایه‌های محافظ، محصول را از نور و اکسیژن دور نگه می‌دارند.\n\nدر نتیجه ماندگاری بیشتر می‌شود.",
  en: "Barrier layers keep light and oxygen away from the product.\n\nShelf life gets longer as a result.",
  tr: "Bariyer katmanları ürünü ışıktan ve oksijenden korur.\n\nBöylece raf ömrü uzar.",
};

export const RichText: Story = { args: { kind: "richText", props: { eyebrow: { fa: "دانستنی", en: "Good to know" }, title, body } } };

export const ImageText: Story = {
  args: { kind: "imageText", props: { title, body, image: { src: "/images/journal-2.webp", width: 960, height: 1199, alt: { fa: "تیوب‌های چندلایه", en: "Multi-layer tubes" } }, imageSide: "end", button: { label: { fa: "درخواست نمونه", en: "Request samples" }, href: "#contact" } } },
};

export const CallToActionDark: Story = {
  args: { kind: "cta", props: { title: { fa: "آماده‌اید شروع کنیم؟", en: "Ready to start?" }, body: { fa: "نمونه‌ها را در یک هفته می‌فرستیم.", en: "We ship samples within a week." }, button: { label: { fa: "تماس با ما", en: "Contact us" }, href: "#contact" }, tone: "dark" } },
};

/** Questions open and close (details/summary); they also become FAQPage structured data. */
export const Faq: Story = {
  globals: { locale: "en" },
  args: {
    kind: "faq",
    props: {
      title: { en: "Frequently asked questions", fa: "پرسش‌های پرتکرار" },
      items: [
        { q: { en: "What is the minimum order?", fa: "حداقل سفارش چقدر است؟" }, a: { en: "10,000 tubes per size.", fa: "۱۰ هزار تیوب برای هر اندازه." } },
        { q: { en: "Can you print in five colours?", fa: "چاپ پنج‌رنگ دارید؟" }, a: { en: "Yes, with offset or silk screen.", fa: "بله، با افست یا سیلک." } },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const q = c.getByText("What is the minimum order?");
    await userEvent.click(q);
    await expect(c.getByText("10,000 tubes per size.")).toBeVisible();
  },
};

export const Spacer: Story = { args: { kind: "spacer", props: { size: "m" } } };
