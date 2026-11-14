import type { Locale } from "@/lib/i18n";
import { localeMeta } from "@/lib/i18n";
import { fill, tx, type BlogComment, type BlogPage, type BlogPost } from "@/lib/blog";
import { at, dateFmt } from "./parts";
import styles from "./Blog.module.css";

/**
 * Comments, newsletter and search: plain HTML forms, no client JavaScript. A form posts to a site
 * route, which forwards to OPEX and answers with a redirect to an anchor on the page
 * (#comment-pending …); CSS :target shows the matching message.
 */

/** A field bots fill and people never see (kept off-screen, out of the tab order and the a11y tree). */
const Honeypot = () => (
  <div className={styles.hp} aria-hidden="true">
    <label>
      Website
      <input name="website" tabIndex={-1} autoComplete="off" />
    </label>
  </div>
);

function CommentForm({ post, page, locale, back, parentId, requireEmail, id }: { post: BlogPost; page: BlogPage; locale: Locale; back: string; parentId?: string; requireEmail: boolean; id: string }) {
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  return (
    <form className={styles.form} method="post" action="/api/blog/comments">
      <input type="hidden" name="postId" value={post.id} />
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <Honeypot />
      <div className={styles.formRow}>
        <label>
          <span>{L("commentName")}</span>
          <input name="name" required minLength={2} maxLength={80} autoComplete="name" id={`${id}-name`} />
        </label>
        <label>
          <span>{L("commentEmail")}</span>
          <input name="email" type="email" required={requireEmail} maxLength={200} autoComplete="email" dir="ltr" id={`${id}-email`} />
        </label>
      </div>
      <label>
        <span>{L("commentBody")}</span>
        <textarea name="body" required minLength={3} maxLength={2000} rows={parentId ? 3 : 5} id={`${id}-body`} />
      </label>
      <button type="submit" className={styles.submit}>
        {L("commentSubmit")}
      </button>
    </form>
  );
}

function CommentItem({ c, post, page, locale, back, open, requireEmail }: { c: BlogComment; post: BlogPost; page: BlogPage; locale: Locale; back: string; open: boolean; requireEmail: boolean }) {
  const fmt = dateFmt(locale);
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  return (
    <li id={`c-${c.id}`}>
      <article className={styles.comment} data-team={c.team || undefined}>
        <header>
          <strong>{c.name}</strong>
          {c.team && <span className={styles.badge}>{L("team")}</span>}
          <time dateTime={c.createdAt}>{fmt.format(new Date(c.createdAt))}</time>
        </header>
        <p>{c.body}</p>
      </article>
      {!!c.replies?.length && (
        <ol className={styles.replies}>
          {c.replies.map((r) => (
            <CommentItem key={r.id} c={r} post={post} page={page} locale={locale} back={back} open={false} requireEmail={requireEmail} />
          ))}
        </ol>
      )}
      {open && (
        <details className={styles.replyBox}>
          <summary>{L("reply")}</summary>
          <CommentForm post={post} page={page} locale={locale} back={back} parentId={c.id} requireEmail={requireEmail} id={`r-${c.id}`} />
        </details>
      )}
    </li>
  );
}

export function Comments({ post, page, locale, requireEmail }: { post: BlogPost; page: BlogPage; locale: Locale; requireEmail: boolean }) {
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  const back = at(locale, `/blog/${encodeURIComponent(post.slug)}`);
  const count = post.comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);
  return (
    <section className={styles.section} id="comments" aria-labelledby="comments-h">
      <h2 id="comments-h">
        {L("comments")}
        {count > 0 && <span className={styles.count}> ({count.toLocaleString(localeMeta[locale].intl)})</span>}
      </h2>
      <p id="comment-pending" className={styles.notice} role="status">
        {L("commentPending")}
      </p>
      <p id="comment-approved" className={styles.notice} role="status">
        {L("commentApproved")}
      </p>
      <p id="comment-error" className={`${styles.notice} ${styles.noticeBad}`} role="alert">
        {L("commentError")}
      </p>
      {post.comments.length > 0 ? (
        <ol className={styles.comments}>
          {post.comments.map((c) => (
            <CommentItem key={c.id} c={c} post={post} page={page} locale={locale} back={back} open={post.commentsOpen} requireEmail={requireEmail} />
          ))}
        </ol>
      ) : (
        post.commentsOpen && <p className={styles.muted}>{L("commentsEmpty")}</p>
      )}
      {post.commentsOpen ? (
        <>
          <h3 className={styles.formTitle}>{L("commentWrite")}</h3>
          <CommentForm post={post} page={page} locale={locale} back={back} requireEmail={requireEmail} id="comment" />
        </>
      ) : (
        <p className={styles.muted}>{L("commentsClosed")}</p>
      )}
    </section>
  );
}

/** Newsletter sign-up (double opt-in: OPEX emails a confirmation link). */
export function Newsletter({ page, locale, back }: { page: BlogPage; locale: Locale; back: string }) {
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  return (
    <section className={styles.newsletter} id="newsletter" aria-labelledby="newsletter-h">
      <div>
        <h2 id="newsletter-h">{L("newsletterTitle")}</h2>
        <p>{L("newsletterText")}</p>
      </div>
      <form method="post" action="/api/blog/subscribe" className={styles.nlForm}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="back" value={back} />
        <Honeypot />
        <label>
          <span className="sr-only">{L("newsletterEmail")}</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" placeholder={L("newsletterEmail")} />
        </label>
        <button type="submit" className={styles.submit}>
          {L("newsletterSubmit")}
        </button>
      </form>
      <p id="subscribed" className={styles.notice} role="status">
        {L("newsletterSent")}
      </p>
      <p id="subscribe-error" className={`${styles.notice} ${styles.noticeBad}`} role="alert">
        {L("commentError")}
      </p>
    </section>
  );
}

/** GET form to the (noindex) search page. */
export function SearchForm({ page, locale, q = "" }: { page: BlogPage; locale: Locale; q?: string }) {
  const L = (k: keyof BlogPage["labels"]) => tx(page.labels[k], locale);
  return (
    <form role="search" method="get" action={at(locale, "/blog/search")} className={styles.searchForm}>
      <label>
        <span className="sr-only">{L("search")}</span>
        <input type="search" name="q" defaultValue={q} minLength={2} maxLength={100} placeholder={L("searchPlaceholder")} />
      </label>
      <button type="submit" className={styles.submit}>
        {L("search")}
      </button>
    </form>
  );
}

export const searchSummary = (page: BlogPage, locale: Locale, n: number, q: string) => fill(tx(page.labels.searchResults, locale), { n: n.toLocaleString(localeMeta[locale].intl), q });
