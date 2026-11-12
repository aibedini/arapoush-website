"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronIcon } from "@/components/printing/PrintIcons";
import ps from "@/components/printing/Printing.module.css";
import { fill, t, type AboutGallery } from "@/lib/aboutText";
import styles from "./About.module.css";

const isRtl = () => document.documentElement.dir === "rtl";

/**
 * Factory photos. `filmstrip`: a wide snapping strip (swipe, arrows, arrow keys) whose photos drift
 * inside their frames as the strip moves. `mosaic`: a bento grid with the first photo large.
 */
export default function FactoryGallery({ c, locale }: { c: AboutGallery; locale: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const items = c.items;
  const nf = new Intl.NumberFormat(locale);
  const strip = c.style !== "mosaic";
  const latin = locale === "fa" && /^[\x00-\x7F]*$/.test(t(c.eyebrow, locale)) ? "en" : undefined;

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos < 4, end: pos > max - 4 });
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0") : 1;
    setActive(Math.min(items.length - 1, Math.round(pos / step)));
    // Parallax inside each frame: transform only, skipped for reduced motion.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mid = el.getBoundingClientRect().left + el.clientWidth / 2;
    for (const fig of Array.from(el.children) as HTMLElement[]) {
      const r = fig.getBoundingClientRect();
      const d = (r.left + r.width / 2 - mid) / el.clientWidth;
      const img = fig.querySelector<HTMLElement>("img");
      if (img) img.style.transform = `translateX(${(-d * 8).toFixed(2)}%) scale(1.12)`;
    }
  }, [items.length]);

  useEffect(() => {
    if (!strip) return;
    const el = track.current!;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    el.addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, [measure, strip]);

  const go = (i: number) => {
    const card = track.current?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "center" });
  };

  const onKey = (e: React.KeyboardEvent) => {
    const fwd = isRtl() ? "ArrowLeft" : "ArrowRight";
    const back = isRtl() ? "ArrowRight" : "ArrowLeft";
    if (e.key === fwd) go(active + 1);
    else if (e.key === back) go(active - 1);
    else return;
    e.preventDefault();
  };

  return (
    <section id="factory" className={styles.gallery} aria-labelledby="factory-title">
      <div className={ps.inner}>
        <header className={`${ps.head} ${styles.galleryHead}`} data-reveal>
          <p className={ps.kicker} lang={latin}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="factory-title" className={ps.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={ps.lead}>{t(c.lead, locale)}</p>
        </header>
      </div>

      {strip ? (
        <div className={styles.strip}>
          <div ref={track} className={styles.film} tabIndex={0} role="group" aria-roledescription="carousel" aria-label={t(c.title, locale)} onKeyDown={onKey}>
            {items.map((g, i) => (
              <figure key={g.id} className={styles.shot} data-active={i === active || undefined} aria-label={fill(t(c.of, locale), { n: nf.format(i + 1), total: nf.format(items.length) })}>
                <div className={styles.shotImg}>
                  <Image src={g.image.src} alt="" fill sizes="(max-width: 767px) 86vw, 64vw" data-no-mirror />
                </div>
                <figcaption className={styles.shotCap}>
                  <span className={styles.shotNum} aria-hidden="true">
                    {nf.format(i + 1).padStart(2, nf.format(0))}
                  </span>
                  {t(g.caption, locale)}
                </figcaption>
              </figure>
            ))}
          </div>
          <div className={`${ps.inner} ${styles.filmNav}`}>
            <div className={styles.filmProgress} aria-hidden="true">
              <span style={{ transform: `scaleX(${(active + 1) / items.length})` }} />
            </div>
            <span className={styles.filmCount} aria-live="polite">
              {fill(t(c.of, locale), { n: nf.format(active + 1), total: nf.format(items.length) })}
            </span>
            <button type="button" className={ps.round} onClick={() => go(active - 1)} disabled={edges.start} aria-label={t(c.prev, locale)}>
              <ChevronIcon className={`${ps.arrow} ${ps.prevIcon}`} />
            </button>
            <button type="button" className={ps.round} onClick={() => go(active + 1)} disabled={edges.end} aria-label={t(c.next, locale)}>
              <ChevronIcon className={`${ps.arrow} ${ps.nextIcon}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className={ps.inner}>
          <ul className={styles.mosaic} data-reveal-stagger>
            {items.map((g, i) => (
              <li key={g.id} className={styles.tile} data-reveal-item>
                <figure>
                  <div className={styles.tileImg}>
                    <Image src={g.image.src} alt="" fill sizes={i === 0 ? "(max-width: 767px) 92vw, 50vw" : "(max-width: 767px) 46vw, 25vw"} data-no-mirror />
                  </div>
                  <figcaption>{t(g.caption, locale)}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
