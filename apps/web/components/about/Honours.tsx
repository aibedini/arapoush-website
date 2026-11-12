"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon, CloseIcon, EyeIcon } from "@/components/printing/PrintIcons";
import ps from "@/components/printing/Printing.module.css";
import { fill, t, type AboutHonours, type Honour, type HonourKind } from "@/lib/aboutText";
import styles from "./About.module.css";

const KINDS: HonourKind[] = ["certificate", "licence", "award"];
const isRtl = () => document.documentElement.dir === "rtl";

/**
 * Honours and certificates, each with what it means, the year, what it was awarded for and who
 * issued it. `wall`: framed cards in a grid; `list`: one row per document. A filter narrows by kind
 * and the viewer (native <dialog>) shows the document large, with its other copies.
 */
export default function Honours({ c, locale }: { c: AboutHonours; locale: string }) {
  const [kind, setKind] = useState<"all" | HonourKind>("all");
  const [open, setOpen] = useState<number | null>(null);
  const grid = useRef<HTMLUListElement>(null);
  const items = kind === "all" ? c.items : c.items.filter((h) => h.kind === kind);
  const kinds = KINDS.filter((k) => c.items.some((h) => h.kind === k));
  const wall = c.style !== "list";
  const latin = locale === "fa" && /^[\x00-\x7F]*$/.test(t(c.eyebrow, locale)) ? "en" : undefined;

  // A changed filter brings its cards in with a short rise (transform and opacity only).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = Array.from(grid.current?.children ?? []) as HTMLElement[];
    cards.forEach((el, i) =>
      el.animate([{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: Math.min(i, 8) * 40, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }),
    );
  }, [kind]);

  return (
    <section id="honours" className={styles.honours} aria-labelledby="honours-title">
      <div className={ps.inner}>
        <header className={ps.head} data-reveal>
          <p className={ps.kicker} lang={latin}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="honours-title" className={ps.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={ps.lead}>{t(c.lead, locale)}</p>
        </header>

        <div className={styles.filters} role="group" aria-label={t(c.filterLabel, locale)}>
          {(["all", ...kinds] as const).map((k) => (
            <button key={k} type="button" className={styles.filter} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {t(c.filters[k], locale)}
              <span className={styles.filterCount}>{new Intl.NumberFormat(locale).format(k === "all" ? c.items.length : c.items.filter((h) => h.kind === k).length)}</span>
            </button>
          ))}
        </div>

        <ul ref={grid} className={wall ? styles.wall : styles.list}>
          {items.map((h, i) => (
            <li key={h.id} className={styles.honour} data-kind={h.kind}>
              <button type="button" className={styles.honourImg} onClick={() => setOpen(i)} tabIndex={-1} aria-hidden="true">
                <Image src={h.image.src} alt="" fill sizes={wall ? "(max-width: 767px) 92vw, (max-width: 1279px) 46vw, 23vw" : "160px"} data-no-mirror />
              </button>
              <div className={styles.honourBody}>
                <p className={styles.honourKind}>
                  {t(c.filters[h.kind], locale)}
                  {h.year ? <span className={styles.honourYear}>{t(h.year, locale)}</span> : null}
                </p>
                <h3 className={styles.honourTitle}>{t(h.title, locale)}</h3>
                <dl className={styles.honourMeta}>
                  <div>
                    <dt>{t(c.issuer, locale)}</dt>
                    <dd>{t(h.issuer, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t(c.scope, locale)}</dt>
                    <dd>{t(h.scope, locale)}</dd>
                  </div>
                </dl>
                <p className={styles.honourText}>{t(h.text, locale)}</p>
                <button type="button" className={styles.view} onClick={() => setOpen(i)}>
                  <EyeIcon className={styles.viewIcon} />
                  {t(c.view, locale)}
                  <span className={styles.srOnly}>: {t(h.title, locale)}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Viewer c={c} locale={locale} items={items} index={open} onIndex={setOpen} />
    </section>
  );
}

function Viewer({ c, locale, items, index, onIndex }: { c: AboutHonours; locale: string; items: Honour[]; index: number | null; onIndex: (i: number | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [page, setPage] = useState(0);
  const item = index === null ? null : items[index];
  const pages = item ? [item.image, ...(item.copies ?? [])] : [];
  const nf = new Intl.NumberFormat(locale);

  useEffect(() => {
    const d = dialog.current!;
    if (index !== null && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (index === null && d.open) d.close();
    setPage(0);
  }, [index]);

  const step = (d: number) => index !== null && onIndex((index + d + items.length) % items.length);
  const img = pages[page] ?? pages[0];

  return (
    <dialog
      ref={dialog}
      className={`${ps.lightbox} ${styles.viewer}`}
      aria-label={item ? t(item.title, locale) : t(c.title, locale)}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onIndex(null);
      }}
      onKeyDown={(e) => {
        const fwd = isRtl() ? "ArrowLeft" : "ArrowRight";
        const back = isRtl() ? "ArrowRight" : "ArrowLeft";
        if (e.key === fwd) step(1);
        else if (e.key === back) step(-1);
        else return;
        e.preventDefault();
      }}
    >
      {item && img ? (
        <>
          <div className={ps.lbBar}>
            <span className={ps.lbCount}>{fill(t(c.of, locale), { n: nf.format(index! + 1), total: nf.format(items.length) })}</span>
            <button type="button" className={ps.lbBtn} onClick={() => onIndex(null)} aria-label={t(c.close, locale)} autoFocus>
              <CloseIcon />
            </button>
          </div>
          <div className={styles.viewerBody}>
            <div className={styles.viewerStage}>
              <Image key={img.src} src={img.src} alt={t(item.title, locale)} width={img.width} height={img.height} sizes="(max-width: 1099px) 92vw, 50vw" quality={85} data-no-mirror />
              <button type="button" className={`${ps.lbBtn} ${ps.lbNav} ${ps.lbPrev}`} onClick={() => step(-1)} aria-label={t(c.prev, locale)}>
                <ChevronIcon className={ps.prevIcon} />
              </button>
              <button type="button" className={`${ps.lbBtn} ${ps.lbNav} ${ps.lbNext}`} onClick={() => step(1)} aria-label={t(c.next, locale)}>
                <ChevronIcon className={ps.nextIcon} />
              </button>
            </div>
            <div className={styles.viewerText}>
              <p className={styles.honourKind}>
                {t(c.filters[item.kind], locale)}
                {item.year ? <span className={styles.honourYear}>{t(item.year, locale)}</span> : null}
              </p>
              <h3 className={styles.viewerTitle}>{t(item.title, locale)}</h3>
              <dl className={styles.honourMeta}>
                <div>
                  <dt>{t(c.issuer, locale)}</dt>
                  <dd>{t(item.issuer, locale)}</dd>
                </div>
                <div>
                  <dt>{t(c.scope, locale)}</dt>
                  <dd>{t(item.scope, locale)}</dd>
                </div>
              </dl>
              <p className={styles.viewerNote}>{t(item.text, locale)}</p>
              {pages.length > 1 ? (
                <div className={styles.copies} role="group" aria-label={t(c.copies, locale)}>
                  {pages.map((p, i) => (
                    <button key={p.src} type="button" aria-pressed={i === page} aria-label={fill(t(c.of, locale), { n: nf.format(i + 1), total: nf.format(pages.length) })} onClick={() => setPage(i)}>
                      <Image src={p.src} alt="" width={72} height={72} sizes="72px" data-no-mirror />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
