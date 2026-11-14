"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import RollText from "@/components/ui/RollText";
import { links } from "@/lib/site";
import { localeMeta } from "@/lib/i18n/config";
import type { SectionProps } from "@/lib/sections";
import { byId } from "@/lib/content/pick";
import MaybeLink from "@/components/ui/MaybeLink";
import Glow from "@/components/ui/Glow";
import { ArrowRightCircle, ChevronLeftBold, ChevronRightBold } from "@/components/ui/icons";
import styles from "./Insights.module.css";

/** Non-text article data; copy lives in t.insights.articles (same order), photos in t.media.insights. */
const visuals = [
  { id: "journal-1", date: "2026-09-22", tagBg: "#e5ebe4", pos: "50% 46%" },
  { id: "journal-2", date: "2026-09-15", tagBg: "#e1edf4", pos: "50% 40%" },
  { id: "journal-3", date: "2026-09-10", tagBg: "#f4e8df", pos: "50% 30%" },
];

export default function Insights({ t, locale, posts }: SectionProps) {
  const ins = t.insights;
  const track = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const fmt = new Intl.DateTimeFormat(localeMeta[locale].intl, { year: "numeric", month: "short", day: "numeric" });
  const blogHref = t.nav.journal ? `/${locale}/blog` : null;
  // Real journal posts once there are three to fill the row; until then the section's own teasers.
  const items = posts && posts.length >= 3 && t.nav.journal
    ? posts.slice(0, 6).map((p, i) => ({
        id: p.id,
        date: p.publishedAt,
        tagBg: visuals[i % visuals.length]!.tagBg,
        pos: "50% 50%",
        image: p.cover?.src ?? "",
        category: p.category?.name ?? "",
        tag: p.author?.name ?? "",
        title: p.title,
        text: p.excerpt,
        href: `/${locale}/blog/${encodeURIComponent(p.slug)}`,
      }))
    : visuals.flatMap((v, i) => {
        const a = ins.articles[i];
        return a ? [{ ...v, image: byId(t.media.insights.articles, v.id)?.image.src ?? "", category: a.category, tag: a.tag, title: a.title, text: a.text, href: links.articles }] : [];
      });

  // RTL scrollLeft runs 0 → negative, so measure distance from the start edge.
  const sync = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const fromStart = Math.abs(el.scrollLeft);
    setAtStart(fromStart <= 2);
    setAtEnd(fromStart + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);

    // Mouse drag-to-scroll (touch and trackpads use native scrolling).
    let down = false;
    let startX = 0;
    let startLeft = 0;
    let moved = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      el.classList.add(styles.dragging);
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.classList.remove(styles.dragging);
    };
    const onClick = (e: MouseEvent) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [sync]);

  /** dir: +1 = towards the end of the list (reading direction). */
  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const w = card ? card.getBoundingClientRect().width + gap : el.clientWidth * 0.8;
    const rtl = getComputedStyle(el).direction === "rtl";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * w * (rtl ? -1 : 1), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section id="insights" className={styles.section} aria-labelledby="insights-title">
      <div className="canvas" style={{ "--h": 931 } as React.CSSProperties}>
        <Glow x={1388} y={41} color="#edf0f3" />
        <Glow x={451} y={414} color="#edf0f3" />

        <div className={`at ${styles.intro}`} style={{ "--x": 48, "--y": 158, "--w": 481 } as React.CSSProperties}>
          <p className="eyebrow" data-reveal>
            {ins.eyebrow}
          </p>
          <h2 id="insights-title" className="t-h2" data-reveal-lines>
            {ins.title.map((line, i) => (
              <span key={line} className="line-mask">
                <span className={i > 0 ? "t-muted" : undefined}>{line}</span>
              </span>
            ))}
          </h2>
          <p className="t-lead" data-reveal>
            {ins.lead}
          </p>
          <div data-reveal>
            <MaybeLink href={links.allArticles ?? blogHref} className={`btn ${styles.allBtn}`}>
              <RollText text={ins.viewAll} />
              <span className="icon">
                <ArrowRightCircle color="#A9ACAF" />
              </span>
            </MaybeLink>
          </div>
        </div>

        <div className={styles.viewport}>
          <ul ref={track} className={styles.track} tabIndex={0} aria-label={ins.listLabel} data-reveal-stagger>
            {items.map((a) => {
              const v = a;
              return (
                <li key={v.id} className={styles.slide} data-reveal-item>
                  <article className={styles.card}>
                    <div className={`zoom-mask ${styles.media}`} data-reveal-media>
                      <div className={styles.mediaInner}>
                        {a.image && <Image src={a.image} alt="" fill sizes="(max-width: 767px) 46vw, (max-width: 1099px) 46vw, 25vw" style={{ objectPosition: v.pos }} draggable={false} />}
                      </div>
                      {a.category && <span className={styles.category}>{a.category}</span>}
                    </div>
                    <div className={styles.meta}>
                      <time className={styles.date} dateTime={v.date}>
                        {fmt.format(new Date(v.date))}
                      </time>
                      {a.tag && (
                        <span className={styles.tag} style={{ background: v.tagBg }}>
                          {a.tag}
                        </span>
                      )}
                    </div>
                    <div className={styles.body}>
                      <h3 className={styles.title}>
                        <MaybeLink href={a.href} className={styles.titleLink}>
                          {a.title}
                        </MaybeLink>
                      </h3>
                      <p className={styles.text}>{a.text}</p>
                      <ArrowRightCircle className={styles.arrow} color="#1E1E1E" />
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`at ${styles.controls}`} style={{ "--x": 1338, "--y": 787, "--w": 534 } as React.CSSProperties}>
          <span className={styles.ctrlLine} aria-hidden="true" />
          <MaybeLink href={links.allArticles ?? blogHref} className={`u-link ${styles.ctrlText}`}>
            {ins.viewAll}
          </MaybeLink>
          <div className={styles.arrows}>
            <button type="button" className={styles.nav} onClick={() => step(-1)} disabled={atStart} aria-label={ins.prev}>
              <ChevronLeftBold />
            </button>
            <button type="button" className={styles.nav} onClick={() => step(1)} disabled={atEnd} aria-label={ins.next}>
              <ChevronRightBold />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
