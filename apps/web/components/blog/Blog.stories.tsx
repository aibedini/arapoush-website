import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import raw from "@/content/blog.json";
import type { BlogCard, BlogPage, BlogPost } from "@/lib/blog";
import type { Locale } from "@/lib/i18n";
import Article from "./Article";
import ListView from "./ListView";
import styles from "./Blog.module.css";

/**
 * Journal: the list (featured first, category chips, pages) and one article with its key
 * takeaways, table of contents, body blocks, FAQ, sources, author and related products. Copy:
 * content/blog.json; posts come from OPEX (here, fixtures).
 */
const page = raw as unknown as BlogPage;
const cover = { src: "/images/printing/layers.webp", width: 1600, height: 1000, alt: "لایه‌های تیوب" };
const card = (i: number, locale: Locale = "fa"): BlogCard => ({
  id: `pst_${i}`,
  locale,
  slug: `post-${i}`,
  title: i === 1 ? "تیوب چندلایه چیست و چرا ماندگاری محصول را بالا می‌برد؟" : `مقالهٔ نمونهٔ ${i}`,
  excerpt: "تیوب چندلایه از چند لایهٔ پلیمری و یک لایهٔ مانع ساخته می‌شود که جلوی نفوذ اکسیژن و نور را می‌گیرد.",
  cover: i % 2 ? cover : null,
  category: { id: "c1", name: "فناوری تیوب", slug: "فناوری-تیوب" },
  author: { id: "a1", name: "مهندس نمونه", slug: "sample" },
  publishedAt: "2026-11-10T08:00:00.000Z",
  modifiedAt: "2026-11-12T08:00:00.000Z",
  readingMinutes: 4,
  featured: i === 1,
});
const post: BlogPost = {
  ...card(1),
  body: [
    { id: "p1", kind: "p", text: "**تیوب چندلایه** دیواره‌ای از چند لایه دارد. جزئیات در [صفحهٔ محصول](/products/multi-layer-tube)." },
    { id: "h1", kind: "h", level: 2, text: "لایه‌ها" },
    { id: "l1", kind: "list", ordered: true, items: ["لایهٔ بیرونی", "لایهٔ مانع", "لایهٔ درونی"] },
    { id: "h2", kind: "h", level: 2, text: "مقایسه" },
    { id: "t1", kind: "table", head: ["ویژگی", "تک‌لایه", "چندلایه"], rows: [["مانع اکسیژن", "کم", "زیاد"]], caption: "مقایسهٔ تقریبی" },
    { id: "c1", kind: "callout", tone: "tip", title: "نکته", text: "برای ویتامین C تیوب چندلایه بگیرید." },
    { id: "q1", kind: "quote", text: "ساختار درست، نیمی از کیفیت است.", cite: "تیم فنی" },
    { id: "cta", kind: "cta", text: "نمونهٔ رایگان می‌خواهید؟", button: "درخواست نمونه", href: "/contact" },
  ],
  keyTakeaways: ["لایهٔ مانع جلوی اکسیژن را می‌گیرد.", "ماندگاری تا دو برابر بیشتر می‌شود.", "مناسب فرمول‌های حساس است."],
  faq: [{ q: "بازیافت‌پذیر است؟", a: "بله؛ ساختارهای تمام‌پلی‌اتیلنی." }],
  sources: [{ title: "Barrier properties of EVOH", url: "https://www.kuraray.com/products/evoh" }],
  seo: { keyphrase: "تیوب چندلایه" },
  products: ["tube", "printing"],
  tags: [{ name: "پایداری", slug: "پایداری" }],
  author: { id: "a1", slug: "sample", name: "مهندس نمونه", role: "مهندس فرایند", bio: "پانزده سال تجربه در تولید تیوب.", expertise: ["Multi-layer tubes"], photo: null, sameAs: [] },
  reviewer: null,
  wordCount: 160,
  alternates: { fa: "post-1" },
  related: [card(2), card(3)],
};

const meta = {
  title: "Blog/Journal",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The journal index: the newest post featured, then the grid; category chips and pages. */
export const List: Story = {
  render: () => (
    <div className={styles.page}>
      <ListView page={page} locale="fa" list={{ items: [1, 2, 3, 4].map((i) => card(i)), total: 30, page: 1, pages: 3 }} cats={[{ name: "فناوری تیوب", slug: "فناوری-تیوب" }]} eyebrow="مجله آراپوش" title="دانش بسته‌بندی، از خط تولید" lead="راهنماها و روندهای صنعت." />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(c.getByRole("navigation", { name: /صفحه‌بندی/ })).toBeVisible();
    await expect(c.getAllByRole("article")).toHaveLength(4);
  },
};

/** An empty journal says so (and its page is noindex). */
export const Empty: Story = {
  render: () => (
    <div className={styles.page}>
      <ListView page={page} locale="fa" list={{ items: [], total: 0, page: 1, pages: 1 }} cats={[]} eyebrow="مجله آراپوش" title="دانش بسته‌بندی، از خط تولید" />
    </div>
  ),
};

/** One article: one H1, anchored H2s in the table of contents, FAQ and sources. */
export const ArticlePage: Story = {
  render: () => (
    <div className={styles.page}>
      <Article post={post} page={page} locale="fa" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await expect(c.getByRole("heading", { level: 2, name: "لایه‌ها" })).toHaveAttribute("id", "لایه-ها");
    await expect(c.getByRole("table")).toBeVisible();
    await expect(c.getByText("بازیافت‌پذیر است؟")).toBeVisible();
  },
};

/** English article: left-to-right, the same structure. */
export const ArticleEnglish: Story = {
  render: () => (
    <div className={styles.page} dir="ltr" lang="en">
      <Article post={{ ...post, locale: "en", title: "What is a multi-layer tube?", body: [{ id: "p", kind: "p", text: "A multi-layer tube has a **barrier** layer." }, { id: "h", kind: "h", level: 2, text: "Layers" }, { id: "h2", kind: "h", level: 2, text: "Comparison" }] }} page={page} locale="en" />
    </div>
  ),
};
