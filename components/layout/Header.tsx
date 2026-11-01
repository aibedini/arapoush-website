"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import RollText from "@/components/ui/RollText";
import { Highlight, HighlightItem } from "@animate-ui/react/primitives/effects/highlight";
import { Shine } from "@animate-ui/react/primitives/effects/shine";
import { gsap, ease, registerGsap, prefersReducedMotion } from "@/lib/animations/motion";
import { locales, localeMeta, type Dictionary, type Locale } from "@/lib/i18n";
import { homeHref } from "@/lib/site";
import { ArrowRight, ArrowRightCircle } from "@/components/ui/icons";
import LanguageSwitch from "./LanguageSwitch";
import SearchDialog from "./SearchDialog";
import ScrollProgressBar from "./ScrollProgressBar";
import styles from "./Header.module.css";

const glide = { type: "spring" as const, stiffness: 380, damping: 34 };

type Props = { t: Dictionary; locale: Locale; /** current path after the locale, e.g. "/products/multi-layer-tube"; "" on home */ path?: string };

export default function Header({ t, locale, path = "" }: Props) {
  const onHome = path === "";
  const to = (href: string) => homeHref(locale, href, onHome);
  // Home marks "Home" as current; product pages mark "Products".
  const current = onHome ? "#top" : "#products";
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);

  // Sticky state: glass deepens after the hero top, hides on scroll down, returns on scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;
    const update = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      if (goingDown && y > window.innerHeight * 0.9) setHidden(true);
      else if (goingUp || y < 120) setHidden(false);
      lastY = y;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mobile/tablet menu: staggered reveal, scroll lock, Escape + focus containment.
  useEffect(() => {
    registerGsap();
    const el = panel.current;
    if (!el) return;
    const items = el.querySelectorAll("[data-menu-item]");
    const reduce = prefersReducedMotion();
    const html = document.documentElement;

    const prevOpen = wasOpen.current;
    wasOpen.current = open;
    if (open) {
      html.style.overflow = "hidden";
      gsap.set(el, { display: "flex" });
      if (reduce) gsap.set([el, items], { opacity: 1, clipPath: "inset(0% 0% 0% 0%)", y: 0 });
      else {
        gsap.fromTo(el, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: ease.inOut });
        // opacity (not autoAlpha) so links stay focusable while they animate in
        gsap.fromTo(items, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, delay: 0.18, ease: ease.out });
      }
      el.querySelector<HTMLElement>("a, button")?.focus();

      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setOpen(false);
        if (e.key === "Tab") {
          const f = Array.from(el.querySelectorAll<HTMLElement>("a, button"));
          if (e.shiftKey && document.activeElement === f[0]) {
            e.preventDefault();
            toggle.current?.focus();
          } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
            e.preventDefault();
            toggle.current?.focus();
          }
        }
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }

    html.style.overflow = "";
    if (prevOpen) toggle.current?.focus();
    if (reduce) gsap.set(el, { display: "none" });
    else gsap.to(el, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: ease.inOut, onComplete: () => void gsap.set(el, { display: "none" }) });
  }, [open]);

  const close = () => setOpen(false);
  const tab = open ? 0 : -1;

  return (
    <>
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""} ${hidden && !open ? styles.hidden : ""}`} data-header>
        <div className={styles.bar}>
          <a href={onHome ? "#top" : `/${locale}`} className={styles.logo} aria-label={t.common.brand} data-intro="nav">
            <Image src="/images/logo.png" alt="" width={266} height={96} priority data-critical data-no-mirror sizes="(max-width: 1099px) 160px, 14vw" />
          </a>

          <nav className={styles.nav} aria-label={t.nav.main}>
            {/* animate-ui Highlight: a soft pill glides between links on hover */}
            <ul>
              <Highlight controlledItems hover className={styles.navPill} transition={glide}>
                {t.nav.items.map((item, i) => (
                  <HighlightItem key={item.href} as="li" value={item.href} data-intro="nav">
                    <a className="u-link" href={to(item.href)} aria-current={item.href === current ? "page" : undefined}>
                      <RollText text={item.label} />
                    </a>
                  </HighlightItem>
                ))}
              </Highlight>
            </ul>
          </nav>

          <div className={styles.actions}>
            <span data-intro="nav" className={styles.desktopOnly}>
              <SearchDialog t={t} triggerClassName={styles.iconBtn} iconClassName={styles.icon24} />
            </span>
            <span data-intro="nav" className={styles.desktopOnly}>
              <LanguageSwitch locale={locale} label={t.nav.language} path={path} />
            </span>
            <Shine asChild enableOnHover color="#ffffff" opacity={0.25}>
              <a href="#contact" className={`btn ${styles.quote}`} data-intro="nav">
                <RollText text={t.nav.quote} />
                <span className="icon">
                  <ArrowRightCircle color="#A9ACAF" />
                </span>
              </a>
            </Shine>
            <button
              ref={toggle}
              type="button"
              className={`${styles.burger} ${open ? styles.burgerOpen : ""}`}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
              onClick={() => setOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
        <ScrollProgressBar label={t.common.progress} />
      </header>

      {/* Outside <header>: its backdrop-filter would otherwise trap this fixed panel. */}
      <div ref={panel} id="mobile-menu" className={styles.panel} aria-hidden={!open}>
        <nav aria-label={t.nav.mobile}>
          <ul>
            <Highlight controlledItems hover className={styles.menuPill} transition={glide}>
              {t.nav.items.map((item, i) => (
                <HighlightItem key={item.href} as="li" value={item.href} data-menu-item>
                  <a href={to(item.href)} onClick={close} tabIndex={tab} className={styles.menuLink}>
                    <span className={styles.menuIndex} aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <RollText text={item.label} className={styles.menuLabel} />
                    <ArrowRight className={styles.menuArrow} color="currentColor" />
                  </a>
                </HighlightItem>
              ))}
            </Highlight>
          </ul>
        </nav>

        <div className={styles.panelFoot} data-menu-item>
          <div className={styles.panelTools}>
            <SearchDialog t={t} triggerClassName={styles.panelSearch} iconClassName={styles.icon24} />
            <ul className={styles.langs} aria-label={t.nav.language}>
              {locales.map((l) => (
                <li key={l}>
                  <Link href={`/${l}${path}`} hrefLang={l} lang={l} tabIndex={tab} aria-current={l === locale ? "true" : undefined}>
                    {localeMeta[l].label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <a href="#contact" className="btn" onClick={close} tabIndex={tab}>
            <RollText text={t.nav.quote} />
            <span className="icon">
              <ArrowRightCircle color="#A9ACAF" />
            </span>
          </a>
        </div>
      </div>
    </>
  );
}
