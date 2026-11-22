"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { atDevice, type Slide, type SlideTransition } from "@arapoush/schema";
import RollText from "@/components/ui/RollText";
import { Magnetic } from "@animate-ui/react/primitives/effects/magnetic";
import { Shine } from "@animate-ui/react/primitives/effects/shine";
import { ShimmeringText } from "@animate-ui/react/primitives/texts/shimmering";
import { gsap, ease, dur, registerGsap, prefersReducedMotion } from "@/lib/animations/motion";
import { onIntro } from "@/lib/animations/intro";
import { useIsoLayoutEffect } from "@/lib/animations/useIsoLayoutEffect";
import type { SectionProps } from "@/lib/sections";
import { ArrowRightCircle, ChevronLeftBold, ChevronRightBold, ChevronRightSoft, PlayCircle } from "@/components/ui/icons";
import { Picture, SlideLayer } from "./hero/SlideMedia";
import { slideVideos } from "./hero/sliderCss";
import styles from "./Hero.module.css";

const LOAD_SLIDES = "arapoush:hero-slides";
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Slides 2–n mount their images once the page is idle (or on first navigation), so slide 1
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

/** From-states of layer entrances (`start`/`end` follow the writing direction). */
function layerFrom(type: string, rtl: boolean): gsap.TweenVars | null {
  const s = rtl ? -1 : 1;
  switch (type) {
    case "none":
      return null;
    case "up":
      return { autoAlpha: 0, y: 40 };
    case "down":
      return { autoAlpha: 0, y: -40 };
    case "start":
      return { autoAlpha: 0, x: -60 * s };
    case "end":
      return { autoAlpha: 0, x: 60 * s };
    case "zoom":
      return { autoAlpha: 0, scale: 0.85 };
    case "mask":
      return { autoAlpha: 0, y: 24, clipPath: "inset(0% 0% 100% 0%)" };
    default:
      return { autoAlpha: 0 };
  }
}

/** Adds the entrances of one slide's free layers to a timeline, starting at `at`. */
function animateLayers(tl: gsap.core.Timeline, root: HTMLElement, index: number, at: number) {
  const rtl = document.documentElement.dir === "rtl";
  root.querySelectorAll<HTMLElement>(`[data-slide-layers][data-index='${index}'] [data-anim]`).forEach((el) => {
    const from = layerFrom(el.dataset.anim ?? "fade", rtl);
    if (!from) return void tl.set(el, { autoAlpha: 1 }, at);
    const to: gsap.TweenVars = { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: Number(el.dataset.duration) || 0.8, ease: ease.out };
    if (from.clipPath) to.clipPath = "inset(0% 0% 0% 0%)";
    tl.fromTo(el, from, to, at + (Number(el.dataset.delay) || 0));
  });
}

/** Client half of the hero. `css` is the per-slide design, built on the server (`HeroSection`). */
export default function Hero(props: SectionProps & { css: string }) {
  return props.t.media.slider.slides.length ? <HeroSlider {...props} /> : null;
}

function HeroSlider({ t, css }: SectionProps & { css: string }) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const activeRef = useRef(0);
  const busy = useRef(false);
  const introDone = useRef(false);
  const progress = useRef<gsap.core.Tween | null>(null);
  const kenBurns = useRef<gsap.core.Tween | null>(null);
  const { settings, slides } = t.media.slider;
  const count = slides.length;
  const seconds = (i: number) => slides[i]?.interval || settings.interval;
  const transitionOf = (i: number): SlideTransition => {
    const own = slides[i]?.transition;
    return own && own !== "inherit" ? own : settings.transition;
  };

  /** Plays the active slide's background video where it is shown; pauses every other one. */
  const syncVideos = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const still = prefersReducedMotion();
    el.querySelectorAll<HTMLVideoElement>("video[data-src]").forEach((v) => {
      const mine = v.closest<HTMLElement>("[data-slide-bg]")?.dataset.index === String(activeRef.current);
      const shown = getComputedStyle(v).display !== "none";
      if (mine && shown && !still) {
        if (v.preload !== "auto") v.preload = "auto";
        void v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    });
  }, []);

  /** Slow zoom on the active background (slides with Ken Burns on). */
  const startKenBurns = useCallback(
    (i: number) => {
      kenBurns.current?.kill();
      const el = root.current;
      if (!el || !slides[i]?.background?.kenBurns || prefersReducedMotion()) return;
      kenBurns.current = gsap.fromTo(el.querySelectorAll(`[data-slide-bg][data-index='${i}'] :is(img,video)`), { scale: 1 }, { scale: 1.08, duration: seconds(i) + 2, ease: "none" });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slides],
  );

  // ── Intro (signature zoom-out) + scroll choreography ─────────────────────
  useIsoLayoutEffect(() => {
    registerGsap();
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const reduce = prefersReducedMotion();

    // Only the first slide is visible at rest.
    gsap.set(q("[data-slide-bg]:not([data-index='0']), [data-slide-product]:not([data-index='0']), [data-slide-copy]:not([data-index='0'])"), { autoAlpha: 0 });
    gsap.set(q("[data-slide-layers]:not([data-index='0'])"), { visibility: "hidden" });
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
      gsap.set(q(`[data-slide-layers]${first} [data-anim]:not([data-anim='none'])`), { autoAlpha: 0 });
      gsap.set(q("[data-cta]"), { y: 16, autoAlpha: 0 });
      gsap.set(q("[data-controls]"), { autoAlpha: 0 });
      gsap.set(nav, { y: -10, autoAlpha: 0 });

      const tl = gsap.timeline({
        paused: true,
        onComplete: () => {
          introDone.current = true;
          startKenBurns(0);
        },
      });
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
      animateLayers(tl, el, 0, 1.2);

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
      kenBurns.current?.kill();
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
      // Spread results into target lists: GSAP treats an empty nested array (a slide without a product) as an object target.
      const pick = (kind: string, i: number, inner = "") => q(`[data-slide-${kind}][data-index='${i}'] ${inner}`.trim());
      const parts = (i: number) => [...pick("bg", i), ...pick("product", i), ...pick("copy", i)];

      activeRef.current = next;
      setActive(next);
      window.dispatchEvent(new Event(LOAD_SLIDES));
      kenBurns.current?.kill();

      const kind = transitionOf(next);
      if (prefersReducedMotion() || kind === "none") {
        gsap.set(parts(from), { autoAlpha: 0 });
        gsap.set(parts(next), { autoAlpha: 1, clearProps: "clipPath,transform" });
        gsap.set(pick("layers", from), { visibility: "hidden" });
        gsap.set(pick("layers", next), { visibility: "visible" });
        gsap.set(pick("layers", next, "[data-anim]"), { autoAlpha: 1, clearProps: "transform,clipPath" });
        syncVideos();
        return;
      }

      busy.current = true;
      const d = settings.duration;
      const k = d / 1.25; // the designed timings were made for a 1.25 s change
      const tl = gsap.timeline({
        defaults: { ease: ease.inOut },
        onComplete: () => {
          gsap.set(parts(from), { autoAlpha: 0 });
          gsap.set([...pick("bg", from), ...pick("bg", next)], { clearProps: "zIndex,clipPath,transform" });
          // Reset the outgoing image so it is clean the next time it comes in.
          gsap.set(pick("bg", from, ":is(img,video)"), { clearProps: "transform" });
          gsap.set(pick("layers", from), { visibility: "hidden" });
          busy.current = false;
          startKenBurns(next);
        },
      });

      // Copy out: lines lift away, supporting text fades; free layers fade.
      tl.to(pick("copy", from, "[data-line] > span"), { yPercent: -110, duration: 0.6, stagger: 0.05, ease: "power3.in" }, 0)
        .to(pick("copy", from, "[data-fade]"), { autoAlpha: 0, y: -12, duration: 0.45 }, 0)
        .to(pick("layers", from, "[data-anim]"), { autoAlpha: 0, duration: 0.45, ease: "power2.in" }, 0)
        .to(pick("product", from), { xPercent: -8 * sign, autoAlpha: 0, duration: 0.8 }, 0.05);

      // Background change.
      const nextBg = pick("bg", next);
      const fromBg = pick("bg", from);
      const nextMedia = pick("bg", next, ":is(img,video)");
      const fromMedia = pick("bg", from, ":is(img,video)");
      gsap.set(fromBg, { zIndex: 1 });
      if (kind === "fade") {
        gsap.set(nextBg, { autoAlpha: 0, zIndex: 2 });
        tl.to(nextBg, { autoAlpha: 1, duration: d, ease: "power1.inOut" }, 0.15).fromTo(nextMedia, { scale: 1.06 }, { scale: 1, duration: d * 1.3, ease: ease.settle }, 0.15);
      } else if (kind === "slide") {
        gsap.set(nextBg, { autoAlpha: 1, zIndex: 2, xPercent: 100 * sign });
        tl.to(nextBg, { xPercent: 0, duration: d }, 0.15).to(fromBg, { xPercent: -35 * sign, duration: d }, 0.15);
      } else if (kind === "zoom") {
        gsap.set(nextBg, { autoAlpha: 0, zIndex: 2 });
        tl.to(nextBg, { autoAlpha: 1, duration: d * 0.8, ease: "power1.inOut" }, 0.15)
          .fromTo(nextMedia, { scale: 1.3 }, { scale: 1, duration: d * 1.3, ease: ease.settle }, 0.15)
          .to(fromMedia, { scale: 1.12, duration: d }, 0.15);
      } else if (kind === "circle" || kind === "curtain") {
        const [a, b] = kind === "circle" ? ["circle(0% at 50% 50%)", "circle(75% at 50% 50%)"] : ["inset(0% 50% 0% 50%)", "inset(0% 0% 0% 0%)"];
        gsap.set(nextBg, { autoAlpha: 1, zIndex: 2, clipPath: a });
        tl.to(nextBg, { clipPath: b, duration: d }, 0.15).fromTo(nextMedia, { scale: 1.1 }, { scale: 1, duration: d * 1.3, ease: ease.settle }, 0.15);
      } else {
        // Wipe in the direction of travel, image settling as it opens (the designed transition).
        const wipeFrom = sign > 0 ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)";
        gsap.set(nextBg, { autoAlpha: 1, zIndex: 2, clipPath: wipeFrom });
        tl.to(nextBg, { clipPath: "inset(0% 0% 0% 0%)", duration: d }, 0.15)
          .fromTo(nextMedia, { scale: 1.16, xPercent: 6 * sign }, { scale: 1, xPercent: 0, duration: d * 1.28, ease: ease.settle }, 0.15)
          .to(fromMedia, { scale: 1.06, xPercent: -4 * sign, duration: d }, 0.15);
      }

      // The wordmark re-settles: a quieter echo of the opening zoom. Product, copy and layers arrive.
      tl.fromTo(q("[data-mark]"), { scale: 1.07 }, { scale: 1, duration: 1.5, ease: ease.settle }, 0.3 * k)
        .fromTo(pick("product", next), { autoAlpha: 0, xPercent: 10 * sign, scale: 1.04 }, { autoAlpha: 1, xPercent: 0, scale: 1, duration: 1.3, ease: ease.out }, 0.55 * k)
        .set(pick("copy", next), { autoAlpha: 1 }, 0.5 * k)
        .fromTo(pick("copy", next, "[data-line] > span"), { yPercent: 112 }, { yPercent: 0, duration: dur.mask, stagger: 0.1, ease: ease.out }, 0.6 * k)
        .fromTo(pick("copy", next, "[data-fade]"), { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.7, ease: ease.out }, 0.85 * k)
        .set(pick("layers", next), { visibility: "visible" }, 0.4 * k);
      animateLayers(tl, el, next, 0.55 * k);
      syncVideos();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.duration, settings.transition, slides, syncVideos, startKenBurns],
  );

  const next = useCallback(() => goTo((activeRef.current + 1) % count, 1), [goTo, count]);
  const prev = useCallback(() => goTo((activeRef.current - 1 + count) % count, -1), [goTo, count]);

  // ── Autoplay with visible progress (pauses on hover/focus, tab hidden, reduced motion) ──
  useEffect(() => {
    const bar = root.current?.querySelector("[data-progress]");
    if (!bar || prefersReducedMotion() || count < 2 || !settings.autoplay) return;
    progress.current?.kill();
    progress.current = gsap.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: seconds(active), ease: "none", paused: true, onComplete: next });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, count, next, settings.autoplay]);

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

  // Background videos follow the active slide and the device (a resize can switch the source).
  useEffect(() => {
    syncVideos();
    const m = [window.matchMedia("(max-width: 1099px)"), window.matchMedia("(max-width: 767px)")];
    m.forEach((x) => x.addEventListener("change", syncVideos));
    return () => m.forEach((x) => x.removeEventListener("change", syncVideos));
  }, [syncVideos]);

  const slideLabel = (i: number) => t.hero.slideOf.replace("{n}", String(i + 1)).replace("{total}", String(count));
  const hover = settings.pauseOnHover;

  return (
    <section
      ref={root}
      id="top"
      className={styles.hero}
      data-tone={slides[active]?.tone === "dark" ? "dark" : "light"}
      data-active={active}
      aria-roledescription="carousel"
      aria-label={t.hero.label}
      onPointerEnter={() => hover && setPaused(true)}
      onPointerLeave={() => hover && setPaused(false)}
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
      {/* Per-slide design from the slider builder (validated values only, see sliderCss). */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* Layer 0 — backgrounds */}
      <div className={styles.bgScroll} data-bg-scroll>
        {slides.map((s, i) => (
          <Background key={s.key} slide={s} index={i} activeRef={activeRef} onVideo={syncVideos} />
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
        {slides.map((s, i) => {
          const p = s.product ?? {};
          const desktop = atDevice(p, "desktop").image;
          const tablet = atDevice(p, "tablet").image;
          const mobile = atDevice(p, "mobile").image;
          if (!desktop && !tablet && !mobile) return null;
          return (
            <div key={s.key} className={styles.products} data-slide-product data-index={i} aria-hidden={i !== active}>
              <div className={styles.productInner} data-product-inner>
                <AfterLoad now={i === 0}>
                  <Picture desktop={desktop} tablet={tablet} mobile={mobile} alt={text(p.alt)} priority={i === 0} sizes="(max-width: 1099px) 110vw, 56vw" quality={70} />
                </AfterLoad>
              </div>
            </div>
          );
        })}
      </div>

      {/* Free layers — text, images, buttons and shapes placed anywhere, in their own stacking order */}
      {slides.map((s, i) =>
        s.layers?.length ? (
          <div key={s.key} className={styles.layers} data-slide-layers data-index={i} aria-hidden={i !== active}>
            <AfterLoad now={i === 0}>
              {s.layers.map((l, j) => (
                <SlideLayer key={l.key} layer={l} slide={i} index={j} />
              ))}
            </AfterLoad>
          </div>
        ) : null,
      )}

      {/* Layer 3 — copy (stacked in one grid cell so the CTAs never jump) */}
      <div className={styles.content} data-content-scroll>
        <div className={styles.copyStack}>
          {slides.map((s, i) => {
            const Title = i === 0 ? "h1" : "h2";
            const [first, ...rest] = text(s.copy?.title).split("\n");
            return (
              <div
                key={s.key}
                className={styles.copy}
                data-slide-copy
                data-index={i}
                role="group"
                aria-roledescription="slide"
                aria-label={slideLabel(i)}
                aria-hidden={i !== active}
              >
                {first && (
                  <Title className={`t-display ${styles.title}`}>
                    <span className="line-mask" data-line>
                      <span>{first}</span>
                    </span>
                    {rest.map((line, j) => (
                      <span key={j} className="line-mask" data-line>
                        <span className={styles.muted}>{line}</span>
                      </span>
                    ))}
                  </Title>
                )}
                {text(s.copy?.lead) && (
                  <p className={`t-lead ${styles.lead}`} data-fade>
                    {text(s.copy?.lead)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.ctas} data-ctas>
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
          <button type="button" className={`btn btn--ghost ${styles.story}`} data-cta data-story>
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
          {settings.numbers &&
            slides.map((s, i) => (
              <span key={s.key} className={styles.dotWrap}>
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
          {settings.arrows && count > 1 && (
            <button type="button" className={styles.next} onClick={next} aria-label={t.hero.next}>
              <ChevronRightSoft className={styles.nextIcon} />
            </button>
          )}
          {settings.autoplay && count > 1 && (
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
          )}
        </div>

        {/* Phone controls (client mockup): round prev/next */}
        {settings.arrows && count > 1 && (
          <div className={styles.roundNav}>
            <button type="button" onClick={prev} aria-label={t.hero.prev}>
              <ChevronLeftBold />
            </button>
            <button type="button" onClick={next} aria-label={t.hero.next}>
              <ChevronRightBold />
            </button>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live={paused || userPaused ? "polite" : "off"}>
        {slideLabel(active)}
      </p>
    </section>
  );
}

/** One slide's background: colour, image (per device), optional video per device, overlay. */
function Background({ slide, index, activeRef, onVideo }: { slide: Slide; index: number; activeRef: React.RefObject<number>; onVideo: () => void }) {
  const b = slide.background ?? {};
  const videos = [...new Set(Object.values(slideVideos(slide)).filter(Boolean))];
  const poster = atDevice(b, "desktop").image;
  return (
    <div className={styles.bg} data-slide-bg data-index={index} data-mirror={b.mirrorRtl === false ? undefined : ""} aria-hidden="true">
      <div className={styles.bgMirror}>
        <AfterLoad now={index === 0}>
          <Picture desktop={poster} tablet={atDevice(b, "tablet").image} mobile={atDevice(b, "mobile").image} fill priority={index === 0} sizes="100vw" quality={65} className={styles.bgImg} />
        </AfterLoad>
        {videos.length > 0 && (
          // Always after load, even on slide 1: the image stays the LCP element and the poster.
          <AfterLoad now={false}>
            {videos.map((src) => (
              <video
                key={src}
                data-src={src}
                className={styles.bgVideo}
                muted
                loop
                playsInline
                preload="none"
                ref={(v) => {
                  if (v && activeRef.current === index) onVideo();
                }}
              >
                <source src={src} type={src.endsWith(".webm") ? "video/webm" : "video/mp4"} />
              </video>
            ))}
          </AfterLoad>
        )}
        <span className={styles.overlay} />
      </div>
    </div>
  );
}
