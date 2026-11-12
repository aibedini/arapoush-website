"use client";

import { useEffect, useRef, useState } from "react";
import { INDUSTRY_IDS, PICK_INDUSTRY, type IndustryId } from "@/lib/applicationsText";
import { INDUSTRY_ICONS } from "./AppIcons";
import styles from "./Applications.module.css";

/**
 * The industry tabs. Every panel is server-rendered (each industry's full text is in the HTML for
 * search engines and for the old industry pages, which now redirect to #cosmetics, #pharma…); this
 * island only decides which one is shown. Links to #id anywhere on the page, the hero cards and the
 * solution finder open the matching panel.
 */
export default function IndustryTabs({ items, label, children }: { items: { id: IndustryId; name: string; accent: string }[]; label: string; children: React.ReactNode }) {
  const [active, setActive] = useState<IndustryId>(items[0]!.id);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = (id: string, scroll: boolean) => {
      if (!(INDUSTRY_IDS as string[]).includes(id)) return;
      setActive(id as IndustryId);
      if (scroll) requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
    };
    const fromHash = () => open(location.hash.slice(1), true);
    const fromEvent = (e: Event) => open((e as CustomEvent<string>).detail, false);
    fromHash();
    // In-page links (#pharma) would jump to a hidden panel; open it and scroll to the tabs instead.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      const id = a?.getAttribute("href")?.slice(1) ?? "";
      if (!(INDUSTRY_IDS as string[]).includes(id)) return;
      e.preventDefault();
      history.replaceState(null, "", `#${id}`);
      open(id, true);
    };
    addEventListener("hashchange", fromHash);
    addEventListener(PICK_INDUSTRY, fromEvent);
    document.addEventListener("click", onClick);
    return () => {
      removeEventListener("hashchange", fromHash);
      removeEventListener(PICK_INDUSTRY, fromEvent);
      document.removeEventListener("click", onClick);
    };
  }, []);

  const pick = (id: IndustryId, focus = false) => {
    setActive(id);
    history.replaceState(null, "", `#${id}`);
    if (focus) document.getElementById(`tab-${id}`)?.focus();
  };

  return (
    <div ref={root} className={styles.tabsRoot} data-active={active} style={{ "--accent": items.find((x) => x.id === active)?.accent } as React.CSSProperties}>
      <div className={styles.tabs} role="tablist" aria-label={label}>
        {items.map((x, i) => {
          const Icon = INDUSTRY_ICONS[x.id];
          return (
            <button
              key={x.id}
              id={`tab-${x.id}`}
              type="button"
              role="tab"
              aria-selected={x.id === active}
              aria-controls={x.id}
              tabIndex={x.id === active ? 0 : -1}
              className={styles.tab}
              onClick={() => pick(x.id)}
              onKeyDown={(e) => {
                const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
                const step = e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;
                if (e.key === "Home") return (e.preventDefault(), pick(items[0]!.id, true));
                if (e.key === "End") return (e.preventDefault(), pick(items.at(-1)!.id, true));
                if (!step) return;
                e.preventDefault();
                pick(items[(i + step + items.length) % items.length]!.id, true);
              }}
            >
              <Icon className={styles.tabIcon} />
              {x.name}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  );
}
