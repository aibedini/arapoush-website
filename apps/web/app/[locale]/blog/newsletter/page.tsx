import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import styles from "@/components/blog/Blog.module.css";
import { ensureContent } from "@/lib/content";
import { getDictionary, isLocale } from "@/lib/i18n";
import { blogPath, blogSettings, getBlogPage, tx } from "@/lib/blog";
import { at } from "@/components/blog/parts";

type Params = Promise<{ locale: string }>;
type Search = Promise<{ action?: string; token?: string; done?: string }>;

/** Confirm or cancel a newsletter subscription. Never indexed; the action needs a button press. */
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await ensureContent();
  const { locale } = await params;
  const page = getBlogPage();
  return { title: isLocale(locale) ? tx(page.labels.newsletterTitle, locale) : undefined, robots: { index: false, follow: false } };
}

export default async function NewsletterPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await ensureContent();
  const { locale } = await params;
  if (!isLocale(locale) || !blogSettings().enabled) notFound();
  const { action, token, done } = await searchParams;
  const dict = getDictionary(locale);
  const page = getBlogPage();
  const L = (k: keyof typeof page.labels) => tx(page.labels[k], locale);
  const ok = (action === "confirm" || action === "unsubscribe") && typeof token === "string" && /^[\w-]{20,80}$/.test(token);
  const message = done === "confirmed" ? L("newsletterConfirmed") : done === "unsubscribed" ? L("newsletterUnsubscribed") : done ? L("newsletterInvalid") : null;
  return (
    <>
      <Header t={dict} locale={locale} path={blogPath()} />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <span className={styles.eyebrow}>{L("newsletterTitle")}</span>
            <h1 className={styles.title}>{message ?? (action === "unsubscribe" ? L("newsletterUnsubscribe") : L("newsletterConfirm"))}</h1>
            {!message &&
              (ok ? (
                <form method="post" action="/api/blog/newsletter">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="action" value={action} />
                  <button type="submit" className={styles.submit}>
                    {action === "unsubscribe" ? L("newsletterUnsubscribe") : L("newsletterConfirm")}
                  </button>
                </form>
              ) : (
                <p className={styles.lead}>{L("newsletterInvalid")}</p>
              ))}
            <a className={styles.rss} href={at(locale, blogPath())}>
              {L("backToBlog")}
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
