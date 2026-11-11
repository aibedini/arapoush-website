"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { t, type Printing, type Tech } from "@/lib/printingText";
import { ChevronIcon, CloseIcon, ZoomInIcon, ZoomOutIcon } from "./PrintIcons";
import { SHOW_SAMPLE } from "./TechExplorer";
import styles from "./Printing.module.css";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
const isRtl = () => document.documentElement.dir === "rtl";

/**
 * Sample designs: a snapping row (swipe on touch, arrows, dots, arrow keys) whose images open in a
 * full-screen viewer with zoom, pan, swipe and keyboard control. The section states plainly that
 * these are design samples, not delivered projects.
 */
export default function SampleCarousel({ c, techs, locale }: { c: Printing["samples"]; techs: Tech[]; locale: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [flash, setFlash] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items = c.items;
  const nf = new Intl.NumberFormat(locale);
  const methodName = (id: string) => t(techs.find((x) => x.id === id)?.name, locale);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pos = Math.abs(el.scrollLeft);
    setEdges({ start: pos < 4, end: pos > max - 4 });
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0") : 1;
    setActive(Math.min(items.length - 1, Math.round(pos / step)));
  }, [items.length]);

  useEffect(() => {
    const el = track.current!;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      removeEventListener("resize", measure);
    };
  }, [measure]);

  const go = useCallback((i: number) => {
    const el = track.current;
    const card = el?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "start" });
  }, [items.length]);

  // A technology card asked to see its sample: bring it into the row and mark it briefly.
  useEffect(() => {
    let timer = 0;
    const onShow = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const i = items.findIndex((s) => s.id === id);
      if (i < 0) return;
      window.setTimeout(() => go(i), 500);
      setFlash(id);
      clearTimeout(timer);
      timer = window.setTimeout(() => setFlash(null), 2600);
    };
    addEventListener(SHOW_SAMPLE, onShow);
    return () => {
      removeEventListener(SHOW_SAMPLE, onShow);
      clearTimeout(timer);
    };
  }, [go, items]);

  const onKey = (e: React.KeyboardEvent) => {
    const fwd = isRtl() ? "ArrowLeft" : "ArrowRight";
    const back = isRtl() ? "ArrowRight" : "ArrowLeft";
    if (e.key === fwd) go(active + 1);
    else if (e.key === back) go(active - 1);
    else return;
    e.preventDefault();
  };

  return (
    <section id="samples" className={styles.samples} aria-labelledby="samples-title">
      <div className={styles.inner}>
        <header className={styles.head} data-reveal>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="samples-title" className={styles.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={styles.lead}>{t(c.lead, locale)}</p>
        </header>

        <div className={styles.carousel}>
          <div ref={track} className={styles.track} tabIndex={0} role="region" aria-roledescription="carousel" aria-label={t(c.title, locale)} onKeyDown={onKey}>
            {items.map((s, i) => (
              <article key={s.id} className={styles.sample} data-active={flash === s.id || undefined} aria-label={fill(t(c.of, locale), { n: nf.format(i + 1), total: nf.format(items.length) })}>
                <button type="button" className={styles.sampleImg} onClick={() => setOpen(i)} tabIndex={-1} aria-hidden="true">
                  <Image src={s.image.src} alt="" fill sizes="(max-width: 767px) 84vw, (max-width: 1279px) 46vw, 31vw" data-no-mirror />
                  <span className={styles.sampleBadge}>{t(c.badge, locale)}</span>
                </button>
                <div className={styles.sampleBody}>
                  <div className={styles.sampleMeta}>
                    <span className={styles.sampleIndustry}>{t(s.industry, locale)}</span>
                    <h3 className={styles.sampleTitle}>{t(s.title, locale)}</h3>
                    <span className={styles.sampleMethod}>
                      {t(c.method, locale)}: {methodName(s.method)}
                    </span>
                  </div>
                  <button type="button" className={styles.round} onClick={() => setOpen(i)} aria-label={`${t(c.view, locale)}: ${t(s.title, locale)}`}>
                    <ChevronIcon className={`${styles.arrow} ${styles.nextIcon}`} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.carouselNav}>
            <button type="button" className={styles.round} onClick={() => go(active - 1)} disabled={edges.start} aria-label={t(c.prev, locale)}>
              <ChevronIcon className={`${styles.arrow} ${styles.prevIcon}`} />
            </button>
            <button type="button" className={styles.round} onClick={() => go(active + 1)} disabled={edges.end} aria-label={t(c.next, locale)}>
              <ChevronIcon className={`${styles.arrow} ${styles.nextIcon}`} />
            </button>
          </div>
        </div>
        <div className={styles.dots}>
          {items.map((s, i) => (
            <button key={s.id} type="button" aria-current={i === active} aria-label={`${t(s.title, locale)} (${fill(t(c.of, locale), { n: nf.format(i + 1), total: nf.format(items.length) })})`} onClick={() => go(i)} />
          ))}
        </div>
      </div>

      <Lightbox c={c} locale={locale} index={open} onIndex={setOpen} methodName={methodName} />
    </section>
  );
}

function Lightbox({ c, locale, index, onIndex, methodName }: { c: Printing["samples"]; locale: string; index: number | null; onIndex: (i: number | null) => void; methodName: (id: string) => string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const items = c.items;
  const nf = new Intl.NumberFormat(locale);
  const item = index === null ? null : items[index]!;

  useEffect(() => {
    const d = dialog.current!;
    if (index !== null && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    }
    if (index === null && d.open) d.close();
  }, [index]);

  useEffect(() => {
    setZoom(1);
    setOrigin({ x: 50, y: 50 });
  }, [index]);

  const step = (d: number) => index !== null && onIndex((index + d + items.length) % items.length);
  const at = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };

  return (
    <dialog
      ref={dialog}
      className={styles.lightbox}
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
        else if (e.key === "+" || e.key === "=") setZoom(2);
        else if (e.key === "-") setZoom(1);
        else return;
        e.preventDefault();
      }}
    >
      {item && (
        <>
          <div className={styles.lbBar}>
            <span className={styles.lbCount}>{fill(t(c.of, locale), { n: nf.format(index! + 1), total: nf.format(items.length) })}</span>
            <div className={styles.lbTools}>
              <button type="button" className={styles.lbBtn} onClick={() => setZoom(zoom > 1 ? 1 : 2)} aria-label={zoom > 1 ? t(c.zoomOut, locale) : t(c.zoomIn, locale)}>
                {zoom > 1 ? <ZoomOutIcon /> : <ZoomInIcon />}
              </button>
              <button type="button" className={styles.lbBtn} onClick={() => onIndex(null)} aria-label={t(c.close, locale)} autoFocus>
                <CloseIcon />
              </button>
            </div>
          </div>
          <div
            className={styles.lbStage}
            data-zoom={zoom > 1 || undefined}
            onPointerDown={(e) => {
              swipe.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
              // Zoomed: the view follows the pointer (mouse) or the finger (touch) to pan.
              if (zoom > 1 && (e.pointerType === "mouse" || swipe.current)) setOrigin(at(e));
            }}
            onPointerUp={(e) => {
              const s = swipe.current;
              swipe.current = null;
              if (!s || zoom > 1) return;
              const dx = e.clientX - s.x;
              if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) step((dx < 0 ? 1 : -1) * (isRtl() ? -1 : 1));
            }}
            onPointerCancel={() => (swipe.current = null)}
          >
            <div
              key={item.id}
              className={styles.lbImg}
              style={{ transform: `scale(${zoom})`, transformOrigin: `${origin.x}% ${origin.y}%` }}
              onClick={(e) => {
                if (zoom > 1) return setZoom(1);
                const r = e.currentTarget.getBoundingClientRect();
                setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                setZoom(2);
              }}
            >
              <Image src={item.image.src} alt={t(item.title, locale)} width={item.image.width} height={item.image.height} sizes="100vw" quality={90} data-no-mirror draggable={false} />
            </div>
            <button type="button" className={`${styles.lbBtn} ${styles.lbNav} ${styles.lbPrev}`} onClick={() => step(-1)} aria-label={t(c.prev, locale)}>
              <ChevronIcon className={styles.prevIcon} />
            </button>
            <button type="button" className={`${styles.lbBtn} ${styles.lbNav} ${styles.lbNext}`} onClick={() => step(1)} aria-label={t(c.next, locale)}>
              <ChevronIcon className={styles.nextIcon} />
            </button>
          </div>
          <div className={styles.lbCaption}>
            <strong>{t(item.title, locale)}</strong>
            <span>
              {t(c.badge, locale)} · {t(item.industry, locale)} · {t(c.method, locale)}: {methodName(item.method)}
            </span>
            <span>{t(item.text, locale)}</span>
          </div>
        </>
      )}
    </dialog>
  );
}
