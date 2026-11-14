import Image from "next/image";
import Link from "next/link";
import { localeMeta, type Locale } from "@/lib/i18n";
import { pageUrl } from "@/lib/seo";
import { blogPath, categoryPath, fill, tx, type BlogPage, type BlogPost } from "@/lib/blog";
import { ArticleBody, at, authorHref, Breadcrumbs, dateFmt, Inline, PostGrid, Toc } from "./parts";
import styles from "./Blog.module.css";

/** One article: head, cover, key takeaways, body, FAQ, sources, author, related products and posts. */
export default function Article({ post, page, locale }: { post: BlogPost; page: BlogPage; locale: Locale }) {
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  const fmt = dateFmt(locale);
  const url = pageUrl(locale, blogPath(post.slug));
  const updated = post.modifiedAt.slice(0, 10) !== post.publishedAt.slice(0, 10);
  const share = [
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`],
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}`],
    ["X", `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(post.title)}`],
  ] as const;
  const tocTitle = L("toc");

  return (
    <div className={styles.inner}>
      <Breadcrumbs
        label={L("blog")}
        items={[
          [L("home"), at(locale, "")],
          [L("blog"), at(locale, blogPath())],
          ...(post.category?.slug ? ([[post.category.name, at(locale, categoryPath(post.category.slug))]] as [string, string][]) : []),
          [post.title, null],
        ]}
      />
      <header className={styles.articleHead}>
        {post.category && <span className={styles.eyebrow}>{post.category.name}</span>}
        <h1 className={styles.title}>{post.title}</h1>
        {post.excerpt && <p className={styles.lead}>{post.excerpt}</p>}
        <div className={styles.byline}>
          {post.author && (
            <span className={styles.who}>
              {post.author.photo && <Image className={styles.avatar} src={post.author.photo.src} alt="" width={40} height={40} />}
              <span>
                {L("by")}: <Link href={authorHref(locale, post.author.slug)} rel="author">{post.author.name}</Link>
                {post.author.role && <span> · {post.author.role}</span>}
              </span>
            </span>
          )}
          <span>
            {L("published")}: <time dateTime={post.publishedAt}>{fmt.format(new Date(post.publishedAt))}</time>
          </span>
          {updated && (
            <span>
              {L("updated")}: <time dateTime={post.modifiedAt}>{fmt.format(new Date(post.modifiedAt))}</time>
            </span>
          )}
          <span>{fill(L("minutes"), { n: post.readingMinutes.toLocaleString(localeMeta[locale].intl) })}</span>
          {post.reviewer && (
            <span>
              {L("reviewedBy")}: <Link href={authorHref(locale, post.reviewer.slug)}>{post.reviewer.name}</Link>
            </span>
          )}
        </div>
      </header>

      {post.cover && (
        <div className={styles.cover}>
          <Image src={post.cover.src} alt={post.cover.alt ?? ""} fill priority sizes="(max-width: 1500px) 100vw, 1500px" />
        </div>
      )}

      <div className={styles.layout}>
        <article className={styles.article}>
          <details className={`${styles.panel} ${styles.tocMobile}`}>
            <summary>{tocTitle}</summary>
            <Toc body={post.body} title={tocTitle} bare />
          </details>

          {post.keyTakeaways.length > 0 && (
            <section className={styles.takeaways} aria-labelledby="takeaways">
              <h2 id="takeaways">{L("takeaways")}</h2>
              <ul>
                {post.keyTakeaways.map((k, i) => (
                  <li key={i}>
                    <Inline text={k} locale={locale} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <ArticleBody body={post.body} locale={locale} />

          {post.faq.length > 0 && (
            <section className={styles.section} aria-labelledby="faq">
              <h2 id="faq">{L("faq")}</h2>
              <div className={styles.faq}>
                {post.faq.map((f, i) => (
                  <details key={i}>
                    <summary>{f.q}</summary>
                    <div>
                      <Inline text={f.a} locale={locale} />
                    </div>
                  </details>
                ))}
              </div>
            </section>
          )}

          {post.sources.length > 0 && (
            <section className={styles.section} aria-labelledby="sources">
              <h2 id="sources">{L("sources")}</h2>
              <ol className={styles.sources}>
                {post.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s.url} rel="noopener nofollow" target="_blank">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {post.tags.length > 0 && (
            <section className={styles.section} aria-labelledby="tags">
              <h2 id="tags">{L("tags")}</h2>
              <ul className={styles.tags}>
                {post.tags.map((t) => (
                  <li key={t.slug}>
                    <span>{t.name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {post.author && (
            <section className={styles.section} aria-label={L("by")}>
              <div className={styles.authorBox}>
                {post.author.photo ? <Image src={post.author.photo.src} alt="" width={72} height={72} /> : <span />}
                <div>
                  <h3>
                    <Link href={authorHref(locale, post.author.slug)}>{post.author.name}</Link>
                  </h3>
                  {post.author.role && <div className={styles.role}>{post.author.role}</div>}
                  {post.author.bio && <p>{post.author.bio}</p>}
                </div>
              </div>
            </section>
          )}

          <section className={styles.section} aria-labelledby="share">
            <h2 id="share">{L("share")}</h2>
            <div className={styles.share}>
              {share.map(([name, href]) => (
                <a key={name} href={href} rel="noopener nofollow" target="_blank">
                  {name}
                </a>
              ))}
            </div>
          </section>
        </article>

        <aside className={styles.aside}>
          <Toc body={post.body} title={tocTitle} className={styles.toc} />
          {post.products.length > 0 && (
            <nav className={styles.panel} aria-labelledby="products">
              <h2 id="products">{L("relatedProducts")}</h2>
              <ul className={styles.products}>
                {post.products.map((p) => (
                  <li key={p}>
                    <Link href={at(locale, page.products[p].href)}>
                      <strong>{tx(page.products[p].title, locale)}</strong>
                      <span>{tx(page.products[p].text, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>
      </div>

      {post.related.length > 0 && (
        <section className={styles.section} aria-labelledby="related">
          <h2 id="related">{L("related")}</h2>
          <PostGrid items={post.related} page={page} locale={locale} />
        </section>
      )}
    </div>
  );
}
