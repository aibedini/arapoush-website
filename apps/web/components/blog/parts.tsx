import Image from "next/image";
import Link from "next/link";
import { headings, parseInline, type BlogBlock } from "@arapoush/schema";
import { localeMeta, type Locale } from "@/lib/i18n";
import { authorPath, blogPath, categoryPath, fill, pagePath, tx, type BlogCard, type BlogPage } from "@/lib/blog";
import styles from "./Blog.module.css";

/** Locale-prefixed site path. */
export const at = (locale: Locale, path: string) => `/${locale}${path}`;
export const dateFmt = (locale: Locale) => new Intl.DateTimeFormat(localeMeta[locale].intl, { year: "numeric", month: "long", day: "numeric" });

/** `**bold**`, `*italic*`, `[text](url)` — the only markup a post can carry (schema/blog.ts). */
export function Inline({ text, locale }: { text: string; locale: Locale }) {
  return (
    <>
      {parseInline(text).map((x, i) => {
        if (x.t === "b") return <strong key={i}>{x.v}</strong>;
        if (x.t === "i") return <em key={i}>{x.v}</em>;
        if (x.t === "a") {
          if (x.external)
            return (
              <a key={i} href={x.href} rel="noopener" target="_blank">
                {x.v}
              </a>
            );
          // Internal links without a locale get the reader's.
          const href = /^\/(fa|en|tr)(\/|$)/.test(x.href) || x.href.startsWith("#") ? x.href : at(locale, x.href);
          return (
            <Link key={i} href={href}>
              {x.v}
            </Link>
          );
        }
        return x.v;
      })}
    </>
  );
}

export function Breadcrumbs({ items, label }: { items: [string, string | null][]; label: string }) {
  return (
    <nav className={styles.crumbs} aria-label={label}>
      <ol>
        {items.map(([name, href], i) => (
          <li key={i}>{href && i < items.length - 1 ? <Link href={href}>{name}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined}>{name}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

export function PostCard({ post, page, locale, featured = false, priority = false }: { post: BlogCard; page: BlogPage; locale: Locale; featured?: boolean; priority?: boolean }) {
  const fmt = dateFmt(locale);
  return (
    <article className={styles.card}>
      {post.cover && (
        <div className={styles.cardMedia}>
          <Image
            src={post.cover.src}
            alt=""
            fill
            priority={priority}
            sizes={featured ? "(max-width: 899px) 100vw, 60vw" : "(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"}
          />
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.meta}>
          {post.featured && featured && <span className={styles.badge}>{tx(page.labels.featured, locale)}</span>}
          {post.category?.slug ? (
            <Link className={styles.cat} href={at(locale, categoryPath(post.category.slug))}>
              {post.category.name}
            </Link>
          ) : post.category ? (
            <span className={styles.cat}>{post.category.name}</span>
          ) : null}
          <time dateTime={post.publishedAt}>{fmt.format(new Date(post.publishedAt))}</time>
          <span>{fill(tx(page.labels.minutes, locale), { n: post.readingMinutes.toLocaleString(localeMeta[locale].intl) })}</span>
        </div>
        <h3 className={styles.cardTitle}>
          <Link href={at(locale, blogPath(post.slug))}>{post.title}</Link>
        </h3>
        {post.excerpt && <p className={styles.excerpt}>{post.excerpt}</p>}
      </div>
    </article>
  );
}

export function PostGrid({ items, page, locale, featureFirst = false }: { items: BlogCard[]; page: BlogPage; locale: Locale; featureFirst?: boolean }) {
  if (!items.length) return <p className={styles.empty}>{tx(page.labels.empty, locale)}</p>;
  return (
    <ul className={styles.grid}>
      {items.map((p, i) => (
        <li key={p.id} className={featureFirst && i === 0 ? styles.featured : undefined}>
          <PostCard post={p} page={page} locale={locale} featured={featureFirst && i === 0} priority={i === 0} />
        </li>
      ))}
    </ul>
  );
}

/** Real links per page (crawlable), with rel prev/next semantics in the labels. */
export function Pager({ page, pages, locale, label, make }: { page: number; pages: number; locale: Locale; label: BlogPage["labels"]; make?: (n: number) => string }) {
  if (pages <= 1) return null;
  const href = (n: number) => at(locale, (make ?? pagePath)(n));
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2);
  const fmtN = (n: number) => n.toLocaleString(localeMeta[locale].intl);
  return (
    <nav className={styles.pager} aria-label={tx(label.pagination, locale)}>
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev">
          {tx(label.prev, locale)}
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} style={{ display: "contents" }}>
          {i > 0 && n - nums[i - 1]! > 1 && <span aria-hidden="true">…</span>}
          <Link href={href(n)} aria-current={n === page ? "page" : undefined} aria-label={fill(tx(label.page, locale), { n: fmtN(n) })}>
            {fmtN(n)}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} rel="next">
          {tx(label.next, locale)}
        </Link>
      )}
    </nav>
  );
}

export function CategoryChips({ cats, current, page, locale }: { cats: { name: string; slug: string }[]; current?: string; page: BlogPage; locale: Locale }) {
  if (!cats.length) return null;
  return (
    <nav aria-label={tx(page.labels.categories, locale)}>
      <ul className={styles.chips}>
        <li>
          <Link className={styles.chip} href={at(locale, blogPath())} aria-current={!current ? "page" : undefined}>
            {tx(page.labels.all, locale)}
          </Link>
        </li>
        {cats.map((c) => (
          <li key={c.slug}>
            <Link className={styles.chip} href={at(locale, categoryPath(c.slug))} aria-current={current === c.slug ? "page" : undefined}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The post body: semantic HTML from blocks; headings get the anchors the table of contents links to. */
export function ArticleBody({ body, locale }: { body: BlogBlock[]; locale: Locale }) {
  const anchors = new Map(headings(body).map((h) => [h.blockId, h.anchor]));
  return (
    <div className={styles.prose}>
      {body.map((b) => {
        switch (b.kind) {
          case "p":
            return (
              <p key={b.id}>
                <Inline text={b.text} locale={locale} />
              </p>
            );
          case "h": {
            const H = b.level === 2 ? "h2" : "h3";
            return (
              <H key={b.id} id={anchors.get(b.id)}>
                <Inline text={b.text} locale={locale} />
              </H>
            );
          }
          case "list": {
            const List = b.ordered ? "ol" : "ul";
            return (
              <List key={b.id}>
                {b.items.map((it, i) => (
                  <li key={i}>
                    <Inline text={it} locale={locale} />
                  </li>
                ))}
              </List>
            );
          }
          case "image":
            return (
              <figure key={b.id}>
                <Image src={b.image.src} alt={b.image.alt ?? ""} width={b.image.width ?? 1600} height={b.image.height ?? 900} sizes="(max-width: 767px) 100vw, 46rem" />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            );
          case "quote":
            return (
              <blockquote key={b.id}>
                <p>
                  <Inline text={b.text} locale={locale} />
                </p>
                {b.cite && <footer>{b.cite}</footer>}
              </blockquote>
            );
          case "callout":
            return (
              <aside key={b.id} className={styles.callout} data-tone={b.tone}>
                {b.title && <strong>{b.title}</strong>}
                <Inline text={b.text} locale={locale} />
              </aside>
            );
          case "table":
            return (
              <div key={b.id} className={styles.tableWrap} role="region" aria-label={b.caption || undefined} tabIndex={0}>
                <table>
                  {b.caption && <caption>{b.caption}</caption>}
                  {b.head.some(Boolean) && (
                    <thead>
                      <tr>
                        {b.head.map((h, i) => (
                          <th key={i} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {b.rows.map((r, i) => (
                      <tr key={i}>
                        {r.map((c, j) => (
                          <td key={j}>{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "cta": {
            const href = /^\/(fa|en|tr)(\/|$)/.test(b.href) || /^(https:|#)/.test(b.href) ? b.href : at(locale, b.href);
            return (
              <div key={b.id} className={styles.cta}>
                <p>{b.text}</p>
                <Link className={styles.ctaBtn} href={href}>
                  {b.button}
                </Link>
              </div>
            );
          }
        }
      })}
    </div>
  );
}

/** `bare`: the list only (inside the mobile fold-out, which has its own title). */
export function Toc({ body, title, className, bare = false }: { body: BlogBlock[]; title: string; className?: string; bare?: boolean }) {
  const h = headings(body);
  if (h.length < 2) return null;
  return (
    <nav className={bare ? styles.toc : `${styles.panel} ${styles.toc} ${className ?? ""}`} aria-label={title}>
      {!bare && <h2>{title}</h2>}
      <ol>
        {h.map((x) => (
          <li key={x.anchor} className={x.level === 3 ? styles.sub : undefined}>
            <a href={`#${x.anchor}`}>{x.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export const authorHref = (locale: Locale, slug: string) => at(locale, authorPath(slug));
