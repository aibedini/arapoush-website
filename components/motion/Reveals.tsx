"use client";

import { useEffect } from "react";
import { gsap, ScrollTrigger, ease, dur, registerGsap, prefersReducedMotion } from "@/lib/animations/motion";

/**
 * One place for every scroll-entrance on the page, driven by data attributes:
 *   data-reveal              fade + rise
 *   data-reveal-lines        masked line reveal for .line-mask children
 *   data-reveal-stagger      staggers its [data-reveal-item] children
 *   data-reveal-media        settles its first child from scale 1.04 → 1 (hover lives on the <img>)
 *   data-parallax="80"       scrubbed vertical drift in design px (half depth below 1100px)
 * Stat counters use animate-ui's SlidingNumber instead (see TrustedPartners).
 */
export default function Reveals() {
  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;

    const once = (trigger: Element, start = "top 86%") => ({ trigger, start, once: true });
    // Everything here sits below the hero, so it is wired up while the main thread is idle and
    // in small slices (one element per job): no long task competes with hydration or the intro.
    const ctx = gsap.context(() => {});
    const jobs: Array<() => void> = [];

    gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
      jobs.push(() =>
        gsap.from(el, { y: 36, autoAlpha: 0, duration: dur.section, ease: ease.out, delay: Number(el.dataset.delay || 0), scrollTrigger: once(el) }),
      ),
    );
    gsap.utils.toArray<HTMLElement>("[data-reveal-lines]").forEach((el) =>
      jobs.push(() => gsap.from(el.querySelectorAll(".line-mask > span"), { yPercent: 112, duration: dur.mask, stagger: 0.11, ease: ease.out, scrollTrigger: once(el) })),
    );
    gsap.utils.toArray<HTMLElement>("[data-reveal-stagger]").forEach((el) =>
      jobs.push(() =>
        gsap.from(el.querySelectorAll("[data-reveal-item]"), { y: 56, autoAlpha: 0, duration: 0.9, stagger: 0.1, ease: ease.out, scrollTrigger: once(el, "top 82%") }),
      ),
    );
    gsap.utils.toArray<HTMLElement>("[data-reveal-media]").forEach((el) => {
      const inner = el.firstElementChild;
      if (inner) jobs.push(() => gsap.from(inner, { scale: 1.04, duration: 1.4, ease: ease.out, scrollTrigger: once(el, "top 90%") }));
    });
    jobs.push(() => {
      const mm = gsap.matchMedia();
      mm.add({ wide: "(min-width: 1100px)", narrow: "(max-width: 1099px)" }, (c) => {
        const { wide } = c.conditions as { wide: boolean };
        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const amount = (Number(el.dataset.parallax) || 60) * (wide ? 1 : 0.5);
          // Narrow layouts are no longer scaled from the 1920 canvas, so drift in plain px there.
          const u = wide ? Math.min(window.innerWidth, 2400) / 1920 : 1;
          gsap.fromTo(
            el,
            { y: -amount * u },
            { y: amount * u, ease: "none", scrollTrigger: { trigger: el.parentElement ?? el, start: "top bottom", end: "bottom top", scrub: 0.8 } },
          );
        });
      });
    });
    jobs.push(() => {
      if (document.fonts && document.fonts.status !== "loaded") document.fonts.ready.then(() => ScrollTrigger.refresh());
    });

    // Sections use content-visibility: auto, so their real height replaces the estimate the first
    // time they render. Re-measure trigger positions when the page height actually changes.
    let lastHeight = document.documentElement.scrollHeight;
    let timer = 0;
    const resized = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const h = document.documentElement.scrollHeight;
        if (Math.abs(h - lastHeight) > 2) {
          lastHeight = h;
          ScrollTrigger.refresh();
        }
      }, 150);
    });
    resized.observe(document.body);

    let handle = 0;
    const idle = (fn: (d?: IdleDeadline) => void) =>
      window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 50);
    const run = (deadline?: IdleDeadline) => {
      const until = performance.now() + 8;
      while (jobs.length && (deadline && !deadline.didTimeout ? deadline.timeRemaining() > 4 : performance.now() < until)) {
        const job = jobs.shift()!;
        ctx.add(job);
      }
      if (jobs.length) handle = idle(run);
    };
    handle = idle(run);

    return () => {
      resized.disconnect();
      window.clearTimeout(timer);
      jobs.length = 0;
      if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      ctx.revert();
    };
  }, []);

  return null;
}
