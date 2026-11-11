"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import RollText from "@/components/ui/RollText";
import { quoteMailto } from "@/lib/configurator/quote";
import { contact as fileContact, siteUrl, type Contact } from "@/lib/site";
import { t, type Printing, type TechId } from "@/lib/printingText";
import { ArrowIcon, CheckIcon, ChevronIcon } from "./PrintIcons";
import styles from "./Printing.module.css";

/** Ask the samples carousel to show (and highlight) one sample. */
export const SHOW_SAMPLE = "printing:show-sample";

/**
 * The five methods as cards; choosing one opens its detail panel below the grid (macro image,
 * process, capabilities, best use) with a way to its sample design and to ask about it.
 */
export default function TechExplorer({ c, locale, contact = fileContact }: { c: Printing["tech"]; locale: string; contact?: Contact }) {
  const [id, setId] = useState<TechId>(c.items[0]!.id);
  const panel = useRef<HTMLDivElement>(null);
  const tech = c.items.find((i) => i.id === id)!;

  const choose = (next: TechId) => {
    setId(next);
    // On narrow screens the panel is below the fold: bring it into view.
    if (matchMedia("(max-width: 1099px)").matches) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const mail = quoteMailto({
    to: contact.email,
    subject: t(tech.name, locale),
    spec: [t(tech.name, locale), t(tech.summary, locale)],
    fields: [],
    link: `${siteUrl}/${locale}/printing#technologies`,
  });

  return (
    <section id="technologies" className={styles.tech} aria-labelledby="tech-title">
      <div className={styles.inner}>
        <header className={styles.head}>
          <p className={styles.kicker} lang={locale === "fa" ? "en" : undefined}>
            {t(c.eyebrow, locale)}
          </p>
          <h2 id="tech-title" className={styles.h2}>
            {t(c.title, locale)}
          </h2>
          <p className={styles.lead}>{t(c.lead, locale)}</p>
        </header>

        <ul className={styles.cards} data-reveal-stagger>
          {c.items.map((item) => (
            <li key={item.id} data-reveal-item>
              <button type="button" className={styles.card} aria-expanded={item.id === id} aria-controls="tech-detail" onClick={() => choose(item.id)}>
                <span className={styles.cardImg}>
                  <Image src={item.card.src} alt="" fill sizes="(max-width: 767px) 76vw, (max-width: 1279px) 32vw, 19vw" data-no-mirror />
                </span>
                <span className={styles.cardBody}>
                  <span className={styles.cardName}>{t(item.name, locale)}</span>
                  <span className={styles.cardText}>{t(item.summary, locale)}</span>
                  <span className={styles.chips} role="list">
                    {item.advantages.map((a) => (
                      <span key={a.en} role="listitem" className={styles.chip}>
                        {t(a, locale)}
                      </span>
                    ))}
                  </span>
                  <span className={styles.cardMore} aria-hidden="true">
                    <ChevronIcon className={styles.arrow} />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div ref={panel} id="tech-detail" className={styles.detail} aria-live="polite">
          <div key={tech.id} className={`${styles.macro} ${styles.detailIn}`}>
            <Image src={tech.macro.src} alt="" fill sizes="(max-width: 1099px) 92vw, 44vw" data-no-mirror />
          </div>
          <div key={`${tech.id}-copy`} className={`${styles.detailCopy} ${styles.detailIn}`}>
            <h3 className={styles.detailTitle}>{t(tech.name, locale)}</h3>
            <p className={styles.detailText}>{t(tech.summary, locale)}</p>
            <p className={styles.detailLabel}>{t(c.process, locale)}</p>
            <p className={styles.detailText}>{t(tech.process, locale)}</p>
            <p className={styles.detailLabel}>{t(c.capabilities, locale)}</p>
            <ul className={styles.capList}>
              {tech.capabilities.map((cap) => (
                <li key={cap.en}>
                  <CheckIcon />
                  {t(cap, locale)}
                </li>
              ))}
            </ul>
            <p className={styles.detailLabel}>{t(c.uses, locale)}</p>
            <p className={styles.detailText}>{t(tech.uses, locale)}</p>
            <div className={styles.detailActions}>
              <a href="#samples" className="btn" onClick={() => window.dispatchEvent(new CustomEvent(SHOW_SAMPLE, { detail: tech.sample }))}>
                <RollText text={t(c.samples, locale)} />
                <ArrowIcon className={styles.arrow} />
              </a>
              <a href={mail} className={`btn ${styles.ghost}`}>
                <RollText text={t(c.quote, locale)} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
