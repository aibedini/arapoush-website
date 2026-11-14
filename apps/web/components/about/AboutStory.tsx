"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { CheckIcon } from "@/components/printing/PrintIcons";
import ps from "@/components/printing/Printing.module.css";
import { gsap, ScrollTrigger, registerGsap, prefersReducedMotion } from "@/lib/animations/motion";
import { t, type AboutStory as Story } from "@/lib/aboutText";
import styles from "./About.module.css";

/**
 * The story, milestone by milestone, ending on today's scale. `pinned`: on wide screens the section
 * pins and the milestones travel sideways with the scroll (a ghost band of the brand drifts behind at
 * a slower pace, a rail fills as you go). `vertical`, narrow screens and reduced motion: the same
 * panels stacked on a vertical rail. Only transform and opacity animate.
 */
export default function AboutStory({ c, locale }: { c: Story; locale: string }) {
  const root = useRef<HTMLElement>(null);
  const pinned = c.style !== "vertical";
  const total = c.milestones.length;
  const nf = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 });

  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;
    const el = root.current!;
    const track = el.querySelector<HTMLElement>("[data-track]")!;
    const ghost = el.querySelector<HTMLElement>("[data-ghost]");
    const bar = el.querySelector<HTMLElement>("[data-bar]");
    const count = el.querySelector<HTMLElement>("[data-count]");
    const today = el.querySelector<HTMLElement>("[data-today]");
    const panels = gsap.utils.toArray<HTMLElement>("[data-panel]", el);
    const rtl = document.documentElement.dir === "rtl";
    const mm = gsap.matchMedia();
    let shown = -1;
    const show = (i: number) => {
      if (i === shown || !count) return;
      shown = i;
      count.textContent = nf.format(Math.min(total, Math.max(1, i)));
    };

    const ctx = gsap.context(() => {
      // Today's figure rises through its mask once, whichever layout reaches it.
      const todayIn = gsap.timeline({ paused: true });
      if (today) todayIn.from(today.querySelectorAll("[data-rise]"), { yPercent: 110, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "power3.out" });
      let played = false;
      const playToday = () => {
        if (played) return;
        played = true;
        todayIn.play();
      };

      if (pinned) {
        mm.add("(min-width: 1100px)", () => {
          const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: el.querySelector("[data-pin]"),
              pin: true,
              scrub: 0.6,
              start: "top top",
              // The track moves about twice as far as the page scrolls: the whole story (and
              // today's figure) is reached in half the scrolling.
              end: () => `+=${distance() * 0.5}`,
              invalidateOnRefresh: true,
              onUpdate: (st) => {
                show(Math.round(st.progress * (total + 1)));
                if (st.progress > 0.86) playToday();
              },
            },
          });
          tl.to(track, { x: () => (rtl ? 1 : -1) * distance() }, 0);
          if (ghost) tl.to(ghost, { x: () => (rtl ? 1 : -1) * distance() * 0.35 }, 0);
          if (bar) tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1 }, 0);
        });
      }

      // Stacked layout (vertical style, or any narrow screen): panels and the rail reveal on scroll.
      mm.add(pinned ? "(max-width: 1099px)" : "all", () => {
        panels.forEach((p) =>
          gsap.from(p, { y: 48, autoAlpha: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: p, start: "top 85%", once: true } }),
        );
        if (bar) gsap.fromTo(bar, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: track, start: "top 70%", end: "bottom 70%", scrub: 0.5 } });
        if (today) ScrollTrigger.create({ trigger: today, start: "top 75%", once: true, onEnter: playToday });
      });
    }, el);

    return () => {
      mm.revert();
      ctx.revert();
    };
  }, [pinned, total]); // eslint-disable-line react-hooks/exhaustive-deps

  const latin = (s: string) => (locale === "fa" && /^[\x00-\x7F]*$/.test(s) ? "en" : undefined);

  return (
    <section ref={root} id="story" className={`${styles.story} ${pinned ? styles.pinned : styles.vertical}`} aria-labelledby="story-title">
      <div className={styles.storyPin} data-pin>
        <div className={styles.ghost} data-ghost aria-hidden="true" lang="en">
          ARAPOUSH GOSTAR · SINCE 2004 · ARAPOUSH GOSTAR · SINCE 2004
        </div>
        <ol className={styles.track} data-track>
          <li className={`${styles.panel} ${styles.intro}`}>
            <p className={`${ps.kicker} ${ps.light}`} lang={latin(t(c.eyebrow, locale))}>
              {t(c.eyebrow, locale)}
            </p>
            <h2 id="story-title" className={styles.storyTitle}>
              {t(c.title, locale)}
            </h2>
            <p className={styles.storyLead}>{t(c.lead, locale)}</p>
          </li>
          {c.milestones.map((m) => (
            <li key={m.id} className={styles.panel} data-panel>
              <p className={styles.year} aria-hidden="true">
                {t(m.year, locale)}
              </p>
              <span className={styles.node} aria-hidden="true" />
              {m.image ? (
                <div className={styles.panelImg}>
                  {/* Certificates and documents are portrait: the whole photo shows (contain) on a
                      blurred, enlarged copy of itself that fills the frame. Same URL, one download. */}
                  <Image className={styles.panelBackdrop} src={m.image.src} alt="" aria-hidden="true" fill sizes="(max-width: 1099px) 88vw, 30vw" data-no-mirror />
                  <Image className={styles.panelPhoto} src={m.image.src} alt={t(m.title, locale)} fill sizes="(max-width: 1099px) 88vw, 30vw" data-no-mirror />
                </div>
              ) : null}
              <h3 className={styles.panelTitle}>
                <span className={styles.srYear}>{t(m.year, locale)}: </span>
                {t(m.title, locale)}
              </h3>
              <p className={styles.panelText}>{t(m.text, locale)}</p>
            </li>
          ))}
          <li className={`${styles.panel} ${styles.today}`} data-panel data-today>
            <p className={`${ps.kicker} ${ps.light}`} lang={latin(t(c.today.eyebrow, locale))}>
              {t(c.today.eyebrow, locale)}
            </p>
            <h3 className={styles.todayTitle}>{t(c.today.title, locale)}</h3>
            <p className={styles.big} aria-hidden="true">
              <span data-rise>{t(c.today.value, locale)}</span>
            </p>
            <p className={styles.unit}>{t(c.today.unit, locale)}</p>
            <ul className={styles.feats}>
              {c.today.items.map((x, i) => (
                <li key={i}>
                  <CheckIcon className={styles.check} />
                  {t(x, locale)}
                </li>
              ))}
            </ul>
          </li>
        </ol>
        <div className={styles.rail} aria-hidden="true">
          <span className={styles.bar} data-bar />
          <span className={styles.count}>
            <span data-count>{nf.format(1)}</span> / {nf.format(total)}
          </span>
        </div>
      </div>
    </section>
  );
}
