import type { Locale } from "@/lib/i18n";
import { blogPath, tx, type BlogList, type BlogPage } from "@/lib/blog";
import { at, Breadcrumbs, CategoryChips, Pager, PostGrid } from "./parts";
import styles from "./Blog.module.css";

/** Blog index, its pages and category pages: header, category chips, cards, pagination. */
export default function ListView(o: {
  page: BlogPage;
  locale: Locale;
  list: BlogList;
  cats: { name: string; slug: string }[];
  current?: string;
  eyebrow: string;
  title: string;
  lead?: string;
  trail?: [string, string | null][];
  makePage?: (n: number) => string;
}) {
  const L = (k: keyof BlogPage["labels"]) => tx(o.page.labels[k], o.locale);
  return (
    <div className={styles.inner}>
      <Breadcrumbs label={L("blog")} items={[[L("home"), at(o.locale, "")], [L("blog"), o.trail?.length ? at(o.locale, blogPath()) : null], ...(o.trail ?? [])]} />
      <header className={styles.head}>
        <span className={styles.eyebrow}>{o.eyebrow}</span>
        <h1 className={styles.title}>{o.title}</h1>
        {o.lead && <p className={styles.lead}>{o.lead}</p>}
        <CategoryChips cats={o.cats} current={o.current} page={o.page} locale={o.locale} />
        <a className={styles.rss} href={at(o.locale, "/blog/feed.xml")} type="application/rss+xml">
          {L("rss")}
        </a>
      </header>
      <h2 className="sr-only">{L("latest")}</h2>
      <PostGrid items={o.list.items} page={o.page} locale={o.locale} featureFirst={o.list.page === 1 && !o.current && !o.trail?.length} />
      <Pager page={o.list.page} pages={o.list.pages} locale={o.locale} label={o.page.labels} make={o.makePage} />
    </div>
  );
}
