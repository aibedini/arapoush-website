"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import RollText from "@/components/ui/RollText";
import { Magnetic } from "@animate-ui/react/primitives/effects/magnetic";
import { Shine } from "@animate-ui/react/primitives/effects/shine";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import { gsap, ease, dur, registerGsap, prefersReducedMotion } from "@/lib/animations/motion";
import { onIntro } from "@/lib/animations/intro";
import { useIsoLayoutEffect } from "@/lib/animations/useIsoLayoutEffect";
import type { SectionProps } from "@/lib/sections";
import { ArrowRightCircle, ChevronLeftBold, ChevronRightBold, ChevronRightSoft, PlayCircle } from "@/components/ui/icons";
import styles from "./Hero.module.css";


const AUTOPLAY_S = 7;
const LOAD_SLIDES = "arapoush:hero-slides";

/** Slides 2–3 mount their images once the page is idle (or on first navigation), so slide 1
 *  owns the bandwidth for LCP. Own state keeps the mount from re-rendering the whole hero. */
function AfterLoad({ now, children }: { now: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(now);
  useEffect(() => {
    if (on) return;
    const show = () => setOn(true);
    let idle = 0;
    const later = () => {
      idle = window.requestIdleCallback ? window.requestIdleCallback(show, { timeout: 2500 }) : window.setTimeout(show, 1200);
    };
    if (document.readyState === "complete") later();
    else window.addEventListener("load", later, { once: true });
    window.addEventListener(LOAD_SLIDES, show, { once: true });
    return () => {
      window.removeEventListener("load", later);
      window.removeEventListener(LOAD_SLIDES, show);
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, [on]);
  return on ? children : null;
}

export default function Hero({ t }: SectionProps) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const activeRef = useRef(0);
  const busy = useRef(false);
  const introDone = useRef(false);
  const progress = useRef<gsap.core.Tween | null>(null);
  // Visual layers per slide from content (t.media); copy from t.hero.slides, in the same order.
  const visuals = t.media.hero.slides.map((s) => ({
    bg: s.background.src,
    mobile: s.backgroundMobile?.src,
    product: s.product ? { src: s.product.src, w: s.product.width, h: s.product.height } : null,
    tone: s.tone,
  }));
  const slides = t.hero.slides.slice(0, visuals.length);
  const count = slides.length;

  // ── Intro (signature zoom-out) + scroll choreography ─────────────────────
  useIsoLayoutEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const reduce = prefersReducedMotion();

    // Only the first slide is visible at rest.
    gsap.set(q("[data-slide-bg]:not([data-index='0']), [data-slide-product]:not([data-index='0']), [data-slide-copy]:not([data-index='0'])"), { autoAlpha: 0 });
    if (reduce) {
      gsap.set(q("[data-mark]"), { autoAlpha: 1 });
      introDone.current = true;
      return;
    }

    const nav = document.querySelectorAll("[data-intro='nav']");
    let off: () => void = () => {};
    const mm = gsap.matchMedia();

    const ctx = gsap.context(() => {
      const first = "[data-index='0']";
      // Transform + opacity only: animating letter-spacing on a 450px wordmark re-lays out every frame.
      gsap.set(q("[data-mark]"), { scale: 1.6, autoAlpha: 0 });
      gsap.set(q(`[data-slide-bg]${first} img`), { scale: 1.1 });
      gsap.set(q(`[data-slide-product]${first}`), { yPercent: 9, scale: 1.04, autoAlpha: 0 });
      gsap.set(q(`[data-slide-copy]${first} [data-line] > span`), { yPercent: 112 });
      gsap.set(q(`[data-slide-copy]${first} [data-fade]`), { y: 22, autoAlpha: 0 });
      gsap.set(q("[data-cta]"), { y: 16, autoAlpha: 0 });
      gsap.set(q("[data-controls]"), { autoAlpha: 0 });
      gsap.set(nav, { y: -10, autoAlpha: 0 });

      const tl = gsap.timeline({ paused: true, onComplete: () => void (introDone.current = true) });
      // Phase A — brand reveal: the signature zoom-out.
      tl.to(q(`[data-slide-bg]${first} img`), { scale: 1, duration: 2.4, ease: ease.settle }, 0)
        .to(q("[data-mark]"), { scale: 1, duration: dur.heroZoom, ease: ease.settle }, 0)
        .to(q("[data-mark]"), { autoAlpha: 1, duration: 0.9, ease: "power1.out" }, 0)
        // Phase B — product entrance, slightly behind the type for depth.
        .to(q(`[data-slide-product]${first}`), { yPercent: 0, scale: 1, duration: 1.5, ease: ease.out }, 0.7)
        .to(q(`[data-slide-product]${first}`), { autoAlpha: 1, duration: 0.9, ease: "power1.out" }, 0.7)
        // Phase C — content, navigation, controls.
        .to(q(`[data-slide-copy]${first} [data-line] > span`), { yPercent: 0, duration: dur.mask, stagger: 0.12, ease: ease.out }, 1.05)
        .to(q(`[data-slide-copy]${first} [data-fade]`), { y: 0, autoAlpha: 1, duration: dur.section, ease: ease.out }, 1.35)
        .to(q("[data-cta]"), { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.08, ease: ease.out }, 1.5)
        .to(nav, { y: 0, autoAlpha: 1, duration: 0.7, stagger: 0.035, ease: ease.out }, 1.2)
        .to(q("[data-controls]"), { autoAlpha: 1, duration: 0.6 }, 1.75);

      off = onIntro(() => tl.play(0));

      mm.add({ desktop: "(min-width: 768px)", mobile: "(max-width: 767px)" }, (c) => {
        const { desktop } = c.conditions as { desktop: boolean };
        const st = { trigger: el, start: "top top", end: "bottom top", scrub: 0.6 };
        gsap.to(q("[data-mark-scroll]"), { scale: 0.955, ease: "none", scrollTrigger: st });
        // Phones get the same depth, just shallower.
        gsap.to(q("[data-products-scroll]"), { yPercent: desktop ? -14 : -7, ease: "none", scrollTrigger: st });
        gsap.to(q("[data-bg-scroll]"), { yPercent: desktop ? 9 : 5, ease: "none", scrollTrigger: st });
        gsap.to(q("[data-content-scroll]"), { y: desktop ? -50 : -24, ease: "none", scrollTrigger: st });
      });
    }, el);

    return () => {
      off();
      mm.revert();
      ctx.revert();
    };
  }, []);

  // ── Slide transition ─────────────────────────────────────────────────────
  const goTo = useCallback(
    (next: number, direction?: 1 | -1) => {
      const el = root.current;
      const from = activeRef.current;
      if (!el || busy.current || next === from) return;
      const dir = direction ?? (next > from ? 1 : -1);
      const rtl = document.documentElement.dir === "rtl";
      const sign = rtl ? -dir : dir; // physical direction of travel
      const q = gsap.utils.selector(el);
      // Spread results into target lists: GSAP treats an empty nested array (slide 3 has no product) as an object target.
      const pick = (kind: string, i: number, inner = "") => q(`[data-slide-${kind}][data-index='${i}'] ${inner}`.trim());

      activeRef.current = next;
      setActive(next);
      window.dispatchEvent(new Event(LOAD_SLIDES));

      if (prefersReducedMotion()) {
        gsap.set([...pick("bg", from), ...pick("product", from), ...pick("copy", from)], { autoAlpha: 0 });
        gsap.set([...pick("bg", next), ...pick("product", next), ...pick("copy", next)], { autoAlpha: 1, clearProps: "clipPath" });
        return;
      }

      busy.current = true;
      const wipeFrom = sign > 0 ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)";
      const tl = gsap.timeline({
        defaults: { ease: ease.inOut },
        onComplete: () => {
          gsap.set([...pick("bg", from), ...pick("product", from), ...pick("copy", from)], { autoAlpha: 0 });
          gsap.set([...pick("bg", from), ...pick("bg", next)], { clearProps: "zIndex,clipPath" });
          // Reset the outgoing image so it is clean the next time it comes in.
          gsap.set(pick("bg", from, "img"), { clearProps: "transform" });
          busy.current = false;
        },
      });

      // Copy out: lines lift away, supporting text fades.
      tl.to(pick("copy", from, "[data-line] > span"), { yPercent: -110, duration: 0.6, stagger: 0.05, ease: "power3.in" }, 0)
        .to(pick("copy", from, "[data-fade]"), { autoAlpha: 0, y: -12, duration: 0.45 }, 0)
        .to(pick("product", from), { xPercent: -8 * sign, autoAlpha: 0, duration: 0.8 }, 0.05);

      // Background wipe in the direction of travel, image settling as it opens.
      gsap.set(pick("bg", next), { autoAlpha: 1, zIndex: 2, clipPath: wipeFrom });
      gsap.set(pick("bg", from), { zIndex: 1 });
      tl.to(pick("bg", next), { clipPath: "inset(0% 0% 0% 0%)", duration: 1.25 }, 0.15)
        .fromTo(pick("bg", next, "img"), { scale: 1.16, xPercent: 6 * sign }, { scale: 1, xPercent: 0, duration: 1.6, ease: ease.settle }, 0.15)
        .to(pick("bg", from, "img"), { scale: 1.06, xPercent: -4 * sign, duration: 1.25 }, 0.15)
        // The wordmark re-settles: a quieter echo of the opening zoom.
        .fromTo(q("[data-mark]"), { scale: 1.07 }, { scale: 1, duration: 1.5, ease: ease.settle }, 0.3)
        // Product and copy arrive.
        .fromTo(pick("product", next), { autoAlpha: 0, xPercent: 10 * sign, scale: 1.04 }, { autoAlpha: 1, xPercent: 0, scale: 1, duration: 1.3, ease: ease.out }, 0.55)
        .set(pick("copy", next), { autoAlpha: 1 }, 0.5)
        .fromTo(pick("copy", next, "[data-line] > span"), { yPercent: 112 }, { yPercent: 0, duration: dur.mask, stagger: 0.1, ease: ease.out }, 0.6)
        .fromTo(pick("copy", next, "[data-fade]"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: ease.out }, 0.85);
    },
    [],
  );

  const next = useCallback(() => goTo((activeRef.current + 1) % count, 1), [goTo, count]);
  const prev = useCallback(() => goTo((activeRef.current - 1 + count) % count, -1), [goTo, count]);

  // ── Autoplay with visible progress (pauses on hover/focus, tab hidden, reduced motion) ──
  useEffect(() => {
    const bar = root.current?.querySelector("[data-progress]");
    if (!bar || prefersReducedMotion() || count < 2) return;
    progress.current?.kill();
    progress.current = gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: AUTOPLAY_S, ease: "none", paused: true, onComplete: next });
    const tick = () => {
      if (introDone.current) {
        progress.current?.play();
        return;
      }
      window.setTimeout(tick, 400);
    };
    tick();
    return () => {
      progress.current?.kill();
    };
  }, [active, count, next]);

  useEffect(() => {
    const p = progress.current;
    if (!p) return;
    if (paused || userPaused) p.pause();
    else if (introDone.current) p.play();
  }, [paused, userPaused, active]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const slideLabel = (i: number) => t.hero.slideOf.replace("{n}", String(i + 1)).replace("{total}", String(count));

  return (
    <section
      ref={root}
      id="top"
      className={styles.hero}
      data-tone={visuals[active].tone}
      data-active={active}
      aria-roledescription="carousel"
      aria-label={t.hero.label}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
      onKeyDown={(e) => {
        const rtl = document.documentElement.dir === "rtl";
        if (e.key === "ArrowRight") (rtl ? prev : next)();
        if (e.key === "ArrowLeft") (rtl ? next : prev)();
      }}
    >
      {/* Layer 0 — backgrounds */}
      <div className={styles.bgScroll} data-bg-scroll>
        {visuals.map((v, i) => (
          <div key={v.bg} className={styles.bg} data-slide-bg data-index={i} aria-hidden="true">
            <AfterLoad now={i === 0}>
              <picture>
                {v.mobile && <source media="(max-width: 767px)" srcSet={v.mobile} />}
                <Image
                  src={v.bg}
                  alt=""
                  fill
                  priority={i === 0}
                  fetchPriority={i === 0 ? "high" : "low"}
                  data-critical={i === 0 ? "" : undefined}
                  sizes="100vw"
                  quality={65}
                  className={styles.bgImg}
                  data-no-mirror
                />
              </picture>
            </AfterLoad>
          </div>
        ))}
      </div>

      {/* Layer 1 — signature wordmark (Latin brand mark in every language) */}
      <div className={styles.markScroll} data-mark-scroll aria-hidden="true">
        <p className={`${styles.mark} ltr`} lang="en" data-mark>
          {/* Transparent glyphs keep the Figma gradient; the shimmer passes as a sky tint. */}
          <ShimmeringText text="ARAPOUSH" duration={1.4} color="rgba(146, 182, 221, 0)" shimmeringColor="rgba(146, 182, 221, 0.75)" />
        </p>
      </div>

      {/* Layer 2 — products */}
      <div className={styles.productsScroll} data-products-scroll>
        {visuals.map((v, i) =>
          v.product ? (
            <div key={v.product.src} className={styles.products} data-slide-product data-index={i} aria-hidden={i !== active}>
              <AfterLoad now={i === 0}>
                <Image
                  src={v.product.src}
                  alt={slides[i]?.productsAlt ?? ""}
                  width={v.product.w}
                  height={v.product.h}
                  priority={i === 0}
                  data-critical={i === 0 ? "" : undefined}
                  sizes="(max-width: 1099px) 110vw, 56vw"
                  quality={70}
                  data-no-mirror
                />
              </AfterLoad>
            </div>
          ) : null,
        )}
      </div>

      {/* Layer 3 — copy (stacked in one grid cell so the CTAs never jump) */}
      <div className={styles.content} data-content-scroll>
        <div className={styles.copyStack}>
          {slides.map((s, i) => {
            const Title = i === 0 ? "h1" : "h2";
            return (
              <div
                key={i}
                className={styles.copy}
                data-slide-copy
                data-index={i}
                role="group"
                aria-roledescription="slide"
                aria-label={slideLabel(i)}
                aria-hidden={i !== active}
              >
                <Title className={`t-display ${styles.title}`}>
                  <span className="line-mask" data-line>
                    <span>{s.title[0]}</span>
                  </span>
                  <span className="line-mask" data-line>
                    <span className={styles.muted}>{s.title[1]}</span>
                  </span>
                </Title>
                <p className={`t-lead ${styles.lead}`} data-fade>
                  {s.lead}
                </p>
              </div>
            );
          })}
        </div>

        <div className={styles.ctas}>
          <div data-cta>
            <Magnetic strength={0.22} range={110} className={styles.magnet}>
              <Shine asChild enableOnHover color="#ffffff" opacity={0.25}>
                <a href="#contact" className="btn">
                  <RollText text={t.hero.quote} />
                  <span className="icon">
                    <ArrowRightCircle color="#A9ACAF" />
                  </span>
                </a>
              </Shine>
            </Magnetic>
          </div>
          <button type="button" className={`btn btn--ghost ${styles.story}`} data-cta>
            <span className="icon">
              <PlayCircle color="currentColor" />
            </span>
            <RollText text={t.hero.story} />
          </button>
        </div>
      </div>

      {/* Controls — Figma indicator: 01 ── 02 03 › (line = autoplay progress) */}
      <div className={styles.controls} data-controls>
        <div className={styles.slides}>
          {slides.map((_, i) => (
            <span key={i} className={styles.dotWrap}>
              <button
                type="button"
                className={`${styles.num} ${i === active ? styles.numActive : ""}`}
                onClick={() => goTo(i)}
                aria-current={i === active ? "true" : undefined}
              >
                {/* Visible number stays inside the accessible name (WCAG 2.5.3). */}
                <span className="sr-only">{t.hero.goTo} </span>
                {String(i + 1).padStart(2, "0")}
              </button>
              {i === active && (
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.fill} data-progress />
                </span>
              )}
            </span>
          ))}
          <button type="button" className={styles.next} onClick={next} aria-label={t.hero.next}>
            <ChevronRightSoft className={styles.nextIcon} />
          </button>
          <button
            type="button"
            className={styles.pause}
            onClick={() => setUserPaused((v) => !v)}
            aria-pressed={userPaused}
            aria-label={userPaused ? "Play" : "Pause"}
          >
            {userPaused ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.5v9l7-4.5-7-4.5Z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3.5h2v9H5zM9 3.5h2v9H9z" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {/* Phone controls (client mockup): round prev/next */}
        <div className={styles.roundNav}>
          <button type="button" onClick={prev} aria-label={t.hero.prev}>
            <ChevronLeftBold />
          </button>
          <button type="button" onClick={next} aria-label={t.hero.next}>
            <ChevronRightBold />
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live={paused || userPaused ? "polite" : "off"}>
        {slideLabel(active)}
      </p>
    </section>
  );
}
